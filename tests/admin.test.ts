import { env } from 'cloudflare:workers';
import { exports } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { hashPassword, timingSafeEqual, verifyPassword } from '../src/server/lib/password.ts';
import {
  clearSessionCookie,
  readSession,
  sameOrigin,
  sessionCookie,
  SESSION_COOKIE,
} from '../src/server/lib/session.ts';
import { clearRateLimits } from '../src/server/lib/rateLimit.ts';

const SECRET = 'secreto-de-prueba-suficientemente-largo-para-hmac';

// 30_000 iteraciones en tests: mismo camino de código, ~100x más rápido que
// las 210_000 de producción.
const TEST_ITERATIONS = 30_000;

/**
 * El secret llega como binding de miniflare (ver vitest.config.ts), no
 * pasadas como argumento: el wrapper del plugin ignora el `env` del `fetch` y
 * usa los bindings declarados en la configuración.
 */
const workerEntry = exports.default as unknown as {
  fetch(request: Request): Response | Promise<Response>;
};
const worker = workerEntry.fetch.bind(workerEntry);

const PASSWORD = 'ClaveSegura123';

function authedFetch(path: string, init: RequestInit = {}, cookie?: string) {
  const headers = new Headers(init.headers);
  if (cookie) headers.set('Cookie', cookie);

  return worker(new Request(`https://sb.test${path}`, { ...init, headers }));
}

beforeEach(async () => {
  await env.DB.prepare('DELETE FROM admins').run();
  await clearRateLimits(env.DB);
  await env.DB.prepare('DELETE FROM slot_holds').run();
  await env.DB.prepare('DELETE FROM appointment_events').run();
  await env.DB.prepare('DELETE FROM appointments').run();
  // Los tests de este archivo crean servicios; si no se limpian, los tests que
  // asumen el catálogo del seed ven 7 en lugar de 6.
  await env.DB.prepare(
    `DELETE FROM services WHERE slug NOT IN
       ('facial','corporal','drenaje','postquirurgico','rejuvenecimiento','valoracion')`,
  ).run();
  await env.DB.prepare('DELETE FROM blocked_dates').run();

  await env.DB.prepare(`INSERT INTO admins (username, password_hash) VALUES (?, ?)`)
    .bind('wendy', await hashPassword(PASSWORD, TEST_ITERATIONS))
    .run();
});

describe('hashPassword / verifyPassword', () => {
  it('reconoce la contraseña correcta', async () => {
    const hash = await hashPassword(PASSWORD, TEST_ITERATIONS);
    expect(await verifyPassword(PASSWORD, hash)).toBe(true);
  });

  it('rechaza una contraseña distinta', async () => {
    const hash = await hashPassword(PASSWORD, TEST_ITERATIONS);
    expect(await verifyPassword(PASSWORD + 'x', hash)).toBe(false);
    expect(await verifyPassword('otra', hash)).toBe(false);
  });

  it('guarda el formato auto-descriptivo', async () => {
    const hash = await hashPassword(PASSWORD, TEST_ITERATIONS);
    expect(hash).toMatch(/^pbkdf2\$\d+\$[\w-]+\$[\w-]+$/);
  });

  it('dos hashes de la misma contraseña son distintos (sal aleatoria)', async () => {
    const a = await hashPassword(PASSWORD, TEST_ITERATIONS);
    const b = await hashPassword(PASSWORD, TEST_ITERATIONS);
    expect(a).not.toBe(b);
    // Pero ambos verifican.
    expect(await verifyPassword(PASSWORD, a)).toBe(true);
    expect(await verifyPassword(PASSWORD, b)).toBe(true);
  });

  it('devuelve false ante un hash corrupto, sin lanzar', async () => {
    expect(await verifyPassword(PASSWORD, 'basura')).toBe(false);
    expect(await verifyPassword(PASSWORD, '')).toBe(false);
    expect(await verifyPassword(PASSWORD, 'pbkdf2$abc$x$y')).toBe(false);
    expect(await verifyPassword(PASSWORD, 'bcrypt$12$abc$def')).toBe(false);
  });
});

describe('timingSafeEqual', () => {
  it('detecta igualdad y diferencia', () => {
    expect(timingSafeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3]))).toBe(true);
    expect(timingSafeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 4]))).toBe(false);
    expect(timingSafeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2, 3]))).toBe(false);
  });
});

describe('cookie de sesión', () => {
  it('lleva HttpOnly, SameSite=Strict, Secure y Path', async () => {
    const cookie = await sessionCookie(SECRET, { id: 1, username: 'wendy' });
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain(`Max-Age=${8 * 60 * 60}`);
  });

  it('round-trip: se lee lo que se escribió', async () => {
    const cookie = await sessionCookie(SECRET, { id: 7, username: 'wendy' });
    const request = new Request('https://sb.test/admin', { headers: { Cookie: cookie } });
    const session = await readSession(request, SECRET);

    expect(session?.username).toBe('wendy');
    expect(session?.adminId).toBe(7);
  });

  it('rechaza si el secreto no coincide', async () => {
    const cookie = await sessionCookie(SECRET, { id: 1, username: 'wendy' });
    const request = new Request('https://sb.test/admin', { headers: { Cookie: cookie } });
    expect(await readSession(request, 'otro-secreto-distinto-de-verdad')).toBeNull();
  });

  it('rechaza si el payload está manipulado', async () => {
    const cookie = await sessionCookie(SECRET, { id: 1, username: 'wendy' });
    const [body] = cookie.split('.');
    // Firma falsa: 43 caracteres base64url (32 bytes), como una real.
    const forged = `${body ?? 'x'}.${'A'.repeat(43)}`;
    const request = new Request('https://sb.test/admin', { headers: { Cookie: `${SESSION_COOKIE}=${forged}` } });
    expect(await readSession(request, SECRET)).toBeNull();
  });

  it('rechaza una sesión caducada', async () => {
    const cookie = await sessionCookie(SECRET, { id: 1, username: 'wendy' }, { ttlSeconds: -10 });
    const request = new Request('https://sb.test/admin', { headers: { Cookie: cookie } });
    expect(await readSession(request, SECRET)).toBeNull();
  });

  it('sin cookie no hay sesión', async () => {
    expect(await readSession(new Request('https://sb.test/admin'), SECRET)).toBeNull();
  });

  it('la cookie de cierre vacía la sesión', () => {
    const cookie = clearSessionCookie();
    expect(cookie).toContain('Max-Age=0');
    expect(cookie).toContain('HttpOnly');
  });
});

describe('sameOrigin', () => {
  it('acepta GET sin Origin', () => {
    expect(sameOrigin(new Request('https://sb.test/api/admin/x'))).toBe(true);
  });

  it('acepta el mismo origen', () => {
    const request = new Request('https://sb.test/api/admin/x', {
      headers: { Origin: 'https://sb.test' },
    });
    expect(sameOrigin(request)).toBe(true);
  });

  it('rechaza un origen ajeno', () => {
    const request = new Request('https://sb.test/api/admin/x', {
      headers: { Origin: 'https://sitio-malicioso.example' },
    });
    expect(sameOrigin(request)).toBe(false);
  });
});

describe('POST /api/admin/login', () => {
  const post = (body: unknown) =>
    authedFetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://sb.test' },
      body: JSON.stringify(body),
    });

  it('acepta credenciales correctas y abre sesión', async () => {
    const res = await post({ username: 'wendy', password: PASSWORD });
    expect(res.status).toBe(200);

    const setCookie = res.headers.get('Set-Cookie');
    expect(setCookie).toContain(SESSION_COOKIE);
    expect(setCookie).toContain('HttpOnly');
  });

  it('rechaza una contraseña incorrecta', async () => {
    expect((await post({ username: 'wendy', password: 'Incorrecta123' })).status).toBe(401);
  });

  it('rechaza un usuario inexistente con el mismo código', async () => {
    const res = await post({ username: 'nadie', password: PASSWORD });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('bad_credentials');
  });

  it('el usuario no distingue mayúsculas', async () => {
    expect((await post({ username: 'WENDY', password: PASSWORD })).status).toBe(200);
  });

  it('valida el cuerpo antes de tocar la base', async () => {
    const res = await post({ username: 'x', password: 'corta' });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('validation_error');
  });

  it('limita los intentos', async () => {
    let limited = false;
    for (let i = 0; i < 12; i += 1) {
      const res = await post({ username: 'wendy', password: 'Incorrecta123' });
      if (res.status === 429) {
        limited = true;
        break;
      }
    }
    expect(limited).toBe(true);
  });
});

describe('protección de las rutas admin', () => {
  const paths: [string, string][] = [
    ['GET', '/api/admin/me'],
    ['GET', '/api/admin/stats'],
    ['GET', '/api/admin/appointments'],
    ['GET', '/api/admin/services'],
    ['GET', '/api/admin/blocked-dates'],
    ['GET', '/api/admin/settings'],
  ];

  it('un anónimo recibe 401 en todas', async () => {
    for (const [method, path] of paths) {
      const res = await authedFetch(path, { method });
      expect(res.status, `${method} ${path}`).toBe(401);
    }
  });

  it('un anónimo no puede crear citas ni tocar servicios', async () => {
    const mutations: [string, string][] = [
      ['POST', '/api/admin/services'],
      ['PATCH', '/api/admin/services/1'],
      ['DELETE', '/api/admin/services/1'],
      ['POST', '/api/admin/blocked-dates'],
      ['PUT', '/api/admin/settings'],
    ];

    for (const [method, path] of mutations) {
      const res = await authedFetch(path, {
        method,
        headers: { 'Content-Type': 'application/json', Origin: 'https://sb.test' },
        body: JSON.stringify({}),
      });
      expect(res.status, `${method} ${path}`).toBe(401);
    }
  });

  it('una cookie firmada con otro secreto no vale', async () => {
    const cookie = await sessionCookie('secreto-del-atacante', { id: 1, username: 'wendy' });
    expect((await authedFetch('/api/admin/me', {}, cookie)).status).toBe(401);
  });
});

describe('rutas admin con sesión válida', () => {
  let cookie: string;

  beforeEach(async () => {
    const res = await authedFetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://sb.test' },
      body: JSON.stringify({ username: 'wendy', password: PASSWORD }),
    });
    cookie = res.headers.get('Set-Cookie')?.split(';')[0] ?? '';
  });

  it('GET /me responde con el usuario', async () => {
    const res = await authedFetch('/api/admin/me', {}, cookie);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { username: string };
    expect(body.username).toBe('wendy');
  });

  it('GET /stats devuelve contadores', async () => {
    const res = await authedFetch('/api/admin/stats', {}, cookie);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { today: number; week: number; pending: number };
    expect(body.today).toBe(0);
    expect(body.week).toBe(0);
  });

  it('GET /services incluye los inactivos', async () => {
    const res = await authedFetch('/api/admin/services', {}, cookie);
    const body = (await res.json()) as { services: unknown[] };
    expect(body.services).toHaveLength(6);
  });

it('bloquea una fecha y desaparece de la disponibilidad', async () => {
      const blocked = await authedFetch(
        '/api/admin/blocked-dates',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Origin: 'https://sb.test' },
          body: JSON.stringify({ date: '2026-11-27', reason: 'Inventario' }),
        },
        cookie,
      );
      expect(blocked.status).toBe(201);

      const res = await worker(
        new Request('https://sb.test/api/availability?service=1&date=2026-11-27', {
          headers: { 'CF-Connecting-IP': '203.0.113.9' },
        }),
      );
      const body = (await res.json()) as { slots: string[]; reason: string | null };
      expect(body.slots).toEqual([]);
      expect(body.reason).toMatch(/No hay atención/i);
    });

  it('crea y edita un servicio', async () => {
    const created = await authedFetch(
      '/api/admin/services',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'https://sb.test' },
        body: JSON.stringify({
          slug: 'masaje-relajante',
          name: 'Masaje relajante',
          description: 'Para soltar tensiones.',
          durationMin: 60,
          priceCop: 150000,
        }),
      },
      cookie,
    );
    expect(created.status).toBe(201);
    const body = (await created.json()) as { service: { id: number; name: string } };

    const updated = await authedFetch(
      `/api/admin/services/${body.service.id}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Origin: 'https://sb.test' },
        body: JSON.stringify({ priceCop: 175000 }),
      },
      cookie,
    );
    expect(updated.status).toBe(200);
    const after = (await updated.json()) as { service: { priceCop: number } };
    expect(after.service.priceCop).toBe(175000);
  });

  it('rechaza un slug duplicado', async () => {
    const res = await authedFetch(
      '/api/admin/services',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'https://sb.test' },
        body: JSON.stringify({ slug: 'facial', name: 'Otro Facial', durationMin: 60, priceCop: 1 }),
      },
      cookie,
    );
    expect(res.status).toBe(409);
  });

  it('un servicio con citas se desactiva en vez de borrarse', async () => {
    await env.DB.prepare(
      `INSERT INTO appointments (reference, service_id, client_name, client_phone, date, time, duration_min)
       VALUES ('SB-TEST9', 1, 'Alguien', '+573000000000', '2026-11-19', '10:00', 60)`,
    ).run();

    const res = await authedFetch('/api/admin/services/1', { method: 'DELETE' }, cookie);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { deleted: boolean; message: string };
    expect(body.deleted).toBe(false);
    expect(body.message).toMatch(/desactivó/i);

    const row = await env.DB.prepare('SELECT active FROM services WHERE id = 1').first<{
      active: number;
    }>();
    expect(row?.active).toBe(0);
  });

  it('rechaza mutaciones desde otro origen', async () => {
    const res = await authedFetch(
      '/api/admin/blocked-dates',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'https://sitio-malicioso.example' },
        body: JSON.stringify({ date: '2026-12-31' }),
      },
      cookie,
    );
    expect(res.status).toBe(403);
  });

  it('guarda los ajustes y se reflejan en /api/config', async () => {
    const res = await authedFetch(
      '/api/admin/settings',
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Origin: 'https://sb.test' },
        body: JSON.stringify({ 'booking.horizon_days': '30', 'booking.minimum_age': '21' }),
      },
      cookie,
    );
    expect(res.status).toBe(200);

    const config = await worker(new Request('https://sb.test/api/config'));
    const body = (await config.json()) as {
      policy: { horizonDays: number; minimumAge: number };
    };
    expect(body.policy.horizonDays).toBe(30);
    expect(body.policy.minimumAge).toBe(21);
  });

  it('cambia la contraseña', async () => {
    const res = await authedFetch(
      '/api/admin/change-password',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'https://sb.test' },
        body: JSON.stringify({ currentPassword: PASSWORD, newPassword: 'NuevaClaveSegura456' }),
      },
      cookie,
    );
    expect(res.status).toBe(200);

    const login = await authedFetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://sb.test' },
      body: JSON.stringify({ username: 'wendy', password: 'NuevaClaveSegura456' }),
    });
    expect(login.status).toBe(200);
  });

  it('no cambia la contraseña si la actual es incorrecta', async () => {
    const res = await authedFetch(
      '/api/admin/change-password',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'https://sb.test' },
        body: JSON.stringify({ currentPassword: 'Equivocada123', newPassword: 'NuevaClaveSegura456' }),
      },
      cookie,
    );
    expect(res.status).toBe(401);
  });

  it('logout cierra la sesión', async () => {
    const res = await authedFetch(
      '/api/admin/logout',
      { method: 'POST', headers: { Origin: 'https://sb.test' } },
      cookie,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('Set-Cookie')).toContain('Max-Age=0');
  });
});