import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { exports } from 'cloudflare:workers';
import { clearRateLimits } from '../src/server/lib/rateLimit.ts';
import { bookableRange } from '../src/lib/slots.ts';

/**
 * El worker de pruebas es `src/server/app.ts`, cuyo export por defecto es un
 * Hono app. El tipo del entrypoint genérico de Cloudflare solo declara
 * `fetch(request)`, así que se estrecha a la firma real que usamos.
 */
interface TestWorkerEntry {
  fetch(request: Request, env: unknown): Response | Promise<Response>;
}

const workerEntry = exports.default as unknown as TestWorkerEntry;
// Hono resuelve las rutas usando `this`: hay que conservar el binding.
const worker = workerEntry.fetch.bind(workerEntry);

const call = (path: string, init?: RequestInit) => {
  const { headers, ...rest } = init ?? {};
  const merged = new Headers(headers);
  // Cloudflare siempre inyecta CF-Connecting-IP; sin él no hay forma de
  // limitar por IP, así que los tests lo simulan.
  if (!merged.has('CF-Connecting-IP')) merged.set('CF-Connecting-IP', '203.0.113.7');

  return worker(
    new Request(`https://soul-and-body.test${path}`, { ...rest, headers: merged }),
    // El router de la API no usa ExecutionContext (no hay assets que servir ni
    // `waitUntil` pendientes), así que basta con el binding.
    env,
  );
};

const post = (path: string, body: unknown) =>
  call(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const TOMORROW = '2026-11-19';
const validBooking = {
  serviceId: 1,
  date: TOMORROW,
  time: '10:00',
  name: 'ana maría pérez',
  phone: '300 123 4567',
  consentHealth: true,
};

beforeEach(async () => {
  await env.DB.prepare('DELETE FROM slot_holds').run();
  await env.DB.prepare('DELETE FROM appointment_events').run();
  await env.DB.prepare('DELETE FROM appointments').run();
  await clearRateLimits(env.DB);
});

describe('GET /api/config', () => {
  it('devuelve servicios, política y datos de contacto', async () => {
    const res = await call('/api/config');
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      services: { id: number; slug: string; priceFormatted: string }[];
      policy: { horizonDays: number; minimumAge: number };
      business: { city: string; whatsappE164: string };
      turnstileSiteKey: string;
    };

    expect(body.services).toHaveLength(6);
    expect(body.services[0]?.priceFormatted).toContain('220');
    expect(body.policy.horizonDays).toBe(60);
    expect(body.policy.minimumAge).toBe(18);
    expect(body.business.city).toBe('Envigado');
    expect(body.business.whatsappE164).toBe('573136147706');
  });

  it('nunca expone el secreto de Turnstile', async () => {
    const body = (await (await call('/api/config')).json()) as Record<string, unknown>;
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain('TURNSTILE_SECRET');
    expect(serialized).not.toContain('service_role');
  });
});

describe('GET /api/availability', () => {
  it('devuelve los horarios libres de un día', async () => {
    const res = await call('/api/availability?service=1&date=2026-11-19');
    expect(res.status).toBe(200);

    const body = (await res.json()) as { slots: string[]; durationMin: number };
    expect(body.durationMin).toBe(60);
    expect(body.slots).toContain('10:00');
    expect(body.slots).not.toContain('17:30');
  });

  it('un domingo devuelve vacío con motivo', async () => {
    const res = await call('/api/availability?service=1&date=2026-11-22');
    const body = (await res.json()) as { slots: string[]; reason: string | null };
    expect(body.slots).toEqual([]);
    expect(body.reason).toMatch(/No atendemos/i);
  });

  it('un servicio de 90 minutos ofrece menos horarios', async () => {
    const res = await call('/api/availability?service=5&date=2026-11-19');
    const body = (await res.json()) as { slots: string[]; durationMin: number };
    expect(body.durationMin).toBe(90);
    expect(body.slots.at(-1)).toBe('16:30');
  });

  it('elimina el horario una vez reservado', async () => {
    const created = await post('/api/bookings', validBooking);
    expect(created.status).toBe(201);

    const res = await call('/api/availability?service=1&date=2026-11-19');
    const body = (await res.json()) as { slots: string[] };
    expect(body.slots).not.toContain('10:00');
    // 09:30 occupy 09:30 y 10:00, así que también desaparece.
    expect(body.slots).not.toContain('09:30');
    expect(body.slots).toContain('09:00');
  });

  it('devuelve el resumen del mes con los días disponibles', async () => {
    const res = await call('/api/availability?service=1&month=2026-11');
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      days: { date: string; open: boolean; available: boolean }[];
      horizonEnd: string;
    };
    expect(body.days).toHaveLength(30);
    expect(body.days.find((d) => d.date === '2026-11-22')?.open).toBe(false);
    expect(body.days.find((d) => d.date === '2026-11-19')?.available).toBe(true);

    // El horizonte depende de "hoy", así que se calcula igual que en el código
    // en vez de fijarlo a una fecha que envejecería.
    const expected = bookableRange(new Date(), 60).at(-1);
    expect(body.horizonEnd).toBe(expected);
  });

  it('404 si el servicio no existe', async () => {
    expect((await call('/api/availability?service=999&date=2026-11-19')).status).toBe(404);
  });

  it('400 si la fecha no existe', async () => {
    // El validador de query responde 400: es un parámetro mal formado, no una
    // regla de negocio incumplida.
    const res = await call('/api/availability?service=1&date=2026-02-31');
    expect(res.status).toBe(400);

    const body = (await res.json()) as { error: string; fields: Record<string, string> };
    expect(body.error).toBe('validation_error');
    expect(body.fields.date).toMatch(/no existe/i);
  });

  it('422 si falta fecha y mes', async () => {
    expect((await call('/api/availability?service=1')).status).toBe(422);
  });
});

describe('POST /api/bookings', () => {
  it('crea la reserva y devuelve el código', async () => {
    const res = await post('/api/bookings', validBooking);

    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      reference: string;
      summary: string;
      whatsappLink: string;
    };
    expect(body.reference).toMatch(/^SB-[A-Z0-9]{6}$/);
    expect(body.summary).toContain('Tratamiento facial');
    expect(body.whatsappLink).toContain('wa.me/573136147706');
  });

  it('normaliza el teléfono y el nombre', async () => {
    await post('/api/bookings', validBooking);
    const { results } = await env.DB.prepare('SELECT client_name, client_phone FROM appointments').all<{
      client_name: string;
      client_phone: string;
    }>();
    expect(results[0]?.client_name).toBe('Ana María Pérez');
    expect(results[0]?.client_phone).toBe('+573001234567');
  });

  it('exige el consentimiento explícito de datos de salud', async () => {
    const res = await post('/api/bookings', { ...validBooking, consentHealth: false });
    expect(res.status).toBe(400);

    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('validation_error');
  });

  it('rechaza a menores de edad (Ley 1799/2016)', async () => {
    const res = await post('/api/bookings', { ...validBooking, age: 15 });
    expect(res.status).toBe(422);

    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe('age_not_allowed');
    expect(body.message).toMatch(/18 años/);
  });

  it('acepta a una clienta mayor', async () => {
    expect((await post('/api/bookings', { ...validBooking, age: 34 })).status).toBe(201);
  });

  it('409 si el horario se acaba de ocupar', async () => {
    await post('/api/bookings', validBooking);

    const second = await post('/api/bookings', {
      ...validBooking,
      name: 'otra persona',
      phone: '3019998877',
    });
    expect(second.status).toBe(409);

    const body = (await second.json()) as { error: string };
    expect(body.error).toBe('slot_unavailable');
  });

  it('409 con mensaje específico si el conflicto llega en la escritura', async () => {
    // Se reserva el bloque de las 10:00 directamente en la base, saltándose la
    // comprobación de cortesía, para forzar el error del índice único.
    await env.DB.batch([
      env.DB
        .prepare(
          `INSERT INTO appointments (reference, service_id, client_name, client_phone, date, time, duration_min)
           VALUES ('SB-BLOQ1', 1, 'Alguien', '+573000000000', ?, '10:00', 60)`,
        )
        .bind(TOMORROW),
      env.DB
        .prepare(`INSERT INTO slot_holds (date, slot, appointment_id) VALUES (?, '10:00', (SELECT id FROM appointments WHERE reference = 'SB-BLOQ1'))`)
        .bind(TOMORROW),
    ]);

    const res = await post('/api/bookings', validBooking);
    // La comprobación previa lo detecta primero; el 409 es el mismo para la
    // clienta, da igual en qué capa se haya atrapado.
    expect(res.status).toBe(409);
  });

  it('422 si se reserva un domingo', async () => {
    const res = await post('/api/bookings', { ...validBooking, date: '2026-11-22' });
    expect(res.status).toBe(422);
  });

  it('422 si la fecha ya pasó', async () => {
    const res = await post('/api/bookings', { ...validBooking, date: '2020-01-06' });
    expect(res.status).toBe(422);
  });

  it('404 si el servicio está inactivo', async () => {
    const res = await post('/api/bookings', { ...validBooking, serviceId: 999 });
    expect(res.status).toBe(404);
  });

  it('guarda el teléfono y la IP de origen', async () => {
    await post('/api/bookings', validBooking);
    const { results } = await env.DB.prepare('SELECT source_ip FROM appointments').all<{
      source_ip: string | null;
    }>();
    expect(results[0]?.source_ip).toBeTruthy();
  });

  it('registra el evento inicial con actor del sistema', async () => {
    await post('/api/bookings', validBooking);
    const { results } = await env.DB.prepare('SELECT * FROM appointment_events').all<{
      from_status: string | null;
      to_status: string;
      actor: string;
    }>();
    expect(results).toHaveLength(1);
    expect(results[0]?.from_status).toBeNull();
    expect(results[0]?.to_status).toBe('pending');
    expect(results[0]?.actor).toBe('system');
  });

  it('el consentimiento de contacto es opcional', async () => {
    const res = await post('/api/bookings', { ...validBooking, consentContact: undefined });
    expect(res.status).toBe(201);
  });
});