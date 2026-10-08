import { Hono } from 'hono';
import type { Context, Next } from 'hono';
import { zValidator } from '@hono/zod-validator';

import {
  appointmentEvents,
  appointmentsInRange,
  blockDate,
  createService,
  deleteService,
  findAdminByUsername,
  findAppointmentById,
  listAppointments,
  listBlockedDates,
  listServices,
  saveSettings,
  unblockDate,
  updateAdminPassword,
  updateAppointmentStatus,
  updateService,
} from '../../lib/repository.ts';
import { loadSiteConfig } from '../../lib/config.ts';
import {
  blockedDateBodySchema,
  changePasswordBodySchema,
  loginBodySchema,
  serviceBodySchema,
  serviceUpdateSchema,
  settingsBodySchema,
  updateStatusBodySchema,
  appointmentListQuerySchema,
} from '../../lib/validation.ts';
import { verifyPassword, hashPassword } from '../lib/password.ts';
import {
  clearSessionCookie,
  createSessionToken,
  readSession,
  sameOrigin,
  sessionCookie,
} from '../lib/session.ts';
import { validationHook } from '../lib/validation.ts';
import { clientIp, consumeRateLimit, RATE_LIMITS } from '../lib/rateLimit.ts';
import { addDays, localDateOf, type DateStr } from '../../lib/time.ts';
import type { AppEnv } from '../app.ts';

/**
 * Panel de administración.
 *
 * Todas las rutas bajo /admin exigen sesión válida. La comprobación vive en el
 * middleware `requireAdmin`, no en cada handler: es imposible añadir una ruta
 * nueva y olvidarse de protegerla.
 */
export const adminRoutes = new Hono<AppEnv>();

/**
 * Middleware de protección. Todas las rutas de este archivo lo usan, así que
 * añadir una ruta nueva sin olvidarse de protegerla es difícil.
 */
const requireAdmin = async (c: Context<AppEnv>, next: Next) => {
  const secret = c.env.SESSION_SECRET;
  if (!secret) {
    // Sin secreto no hay sesiones: es un fallo de configuración, no un 401.
    console.error('[admin] SESSION_SECRET no está configurado');
    return c.json({ error: 'misconfigured', message: 'El panel no está disponible.' }, 503);
  }

  const session = await readSession(c.req.raw, secret);
  if (!session) {
    return c.json({ error: 'no_session', message: 'Inicia sesión para continuar.' }, 401);
  }

  // Las mutaciones exigen mismo origen: sin esto, un formulario en otro sitio
  // podría hacer PATCH a /api/admin/... con la cookie de la víctima.
  if (!sameOrigin(c.req.raw)) {
    return c.json({ error: 'bad_origin', message: 'Origen no permitido.' }, 403);
  }

  c.set('admin', session);
  await next();
};

// ── Sesión ─────────────────────────────────────────────────────────────────

adminRoutes.post('/api/admin/login', zValidator('json', loginBodySchema, validationHook), async (c) => {
  const { username, password } = c.req.valid('json');
  const db = c.env.DB;
  const ip = clientIp(c.req.raw);

  const limit = await consumeRateLimit(db, `login:${ip}`, RATE_LIMITS.login);
  if (!limit.allowed) {
    c.header('Retry-After', String(limit.retryAfter));
    return c.json(
      { error: 'rate_limited', message: 'Demasiados intentos. Espera unos minutos.' },
      429,
    );
  }

  const admin = await findAdminByUsername(db, username);

  // Se verifica siempre, exista el usuario o no. Si el usuario no existe y no
  // se hiciera el hash, el tiempo de respuesta revelaría cuáles son válidos.
  const stored = admin?.password_hash ?? DUMMY_HASH;
  const valid = await verifyPassword(password, stored);

  if (!admin || !valid) {
    return c.json(
      { error: 'bad_credentials', message: 'Usuario o contraseña incorrectos.' },
      401,
    );
  }

  // Se emiten los DOS transportes:
  //  · la cookie, que funciona con dominio propio;
  //  · el token en el cuerpo, que el panel usa como `Authorization: Bearer` y
  //    que no depende de que el navegador guarde cookies. En `*.workers.dev`
  //    no siempre lo hace, y sin esto el login sería imposible.
  c.header('Set-Cookie', await sessionCookie(c.env.SESSION_SECRET, admin));

  return c.json({
    username: admin.username,
    token: await createSessionToken(c.env.SESSION_SECRET, admin),
  });
});

adminRoutes.post('/api/admin/logout', (c) => {
  c.header('Set-Cookie', clearSessionCookie());
  return c.json({ ok: true });
});

adminRoutes.get('/api/admin/me', requireAdmin, (c) => {
  const session = c.get('admin');
  return c.json({ username: session.username, expiresAt: session.expiresAt });
});

// ── Agenda ─────────────────────────────────────────────────────────────────

adminRoutes.get('/api/admin/stats', requireAdmin, async (c) => {
  const db = c.env.DB;
  const today = localDateOf(new Date());
  const weekEnd = addDays(today, 7);

  const [todayRows, weekRows, pendingRows] = await Promise.all([
    appointmentsInRange(db, today, today),
    appointmentsInRange(db, today, weekEnd),
    listAppointments(db, { status: 'pending', limit: 200 }),
  ]);

  const active = (rows: { status: string }[]) =>
    rows.filter((row) => row.status === 'pending' || row.status === 'confirmed').length;

  return c.json({
    today: todayRows.length,
    todayActive: active(todayRows),
    week: weekRows.length,
    weekActive: active(weekRows),
    pending: pendingRows.length,
  });
});

adminRoutes.get(
  '/api/admin/appointments',
  requireAdmin,
  zValidator('query', appointmentListQuerySchema, validationHook),
  async (c) => {
    const filters = c.req.valid('query');
    const appointments = await listAppointments(c.env.DB, filters);
    return c.json({ appointments });
  },
);

adminRoutes.get('/api/admin/appointments/:id', requireAdmin, async (c) => {
  const numeric = Number(c.req.param('id'));
  if (!Number.isInteger(numeric)) {
    return c.json({ error: 'bad_id', message: 'Identificador inválido.' }, 400);
  }

  const appointment = await findAppointmentById(c.env.DB, numeric);
  if (!appointment) {
    return c.json({ error: 'not_found', message: 'Esa cita no existe.' }, 404);
  }

  return c.json({ appointment, events: await appointmentEvents(c.env.DB, numeric) });
});

adminRoutes.patch(
  '/api/admin/appointments/:id/status',
  requireAdmin,
  zValidator('json', updateStatusBodySchema, validationHook),
  async (c) => {
    const { status } = c.req.valid('json');
    const numeric = Number(c.req.param('id'));

    if (!Number.isInteger(numeric)) {
      return c.json({ error: 'bad_id', message: 'Identificador inválido.' }, 400);
    }

    const updated = await updateAppointmentStatus(c.env.DB, numeric, status, 'admin');
    if (!updated) {
      return c.json({ error: 'not_found', message: 'Esa cita no existe.' }, 404);
    }

    return c.json({ appointment: updated });
  },
);

// ── Servicios ──────────────────────────────────────────────────────────────

adminRoutes.get('/api/admin/services', requireAdmin, async (c) => {
  const services = await listServices(c.env.DB, { includeInactive: true });
  return c.json({ services });
});

adminRoutes.post(
  '/api/admin/services',
  requireAdmin,
  zValidator('json', serviceBodySchema, validationHook),
  async (c) => {
    try {
      const service = await createService(c.env.DB, c.req.valid('json'));
      return c.json({ service }, 201);
    } catch (error) {
      // slug duplicado: el UNIQUE de la base lo avisa.
      if (String(error).includes('UNIQUE constraint failed')) {
        return c.json(
          { error: 'duplicate_slug', message: 'Ya existe un servicio con ese identificador.' },
          409,
        );
      }
      throw error;
    }
  },
);

adminRoutes.patch(
  '/api/admin/services/:id',
  requireAdmin,
  zValidator('json', serviceUpdateSchema, validationHook),
  async (c) => {
    const numeric = Number(c.req.param('id'));
    if (!Number.isInteger(numeric)) {
      return c.json({ error: 'bad_id', message: 'Identificador inválido.' }, 400);
    }

    try {
      const service = await updateService(c.env.DB, numeric, c.req.valid('json'));
      if (!service) return c.json({ error: 'not_found', message: 'No existe.' }, 404);
      return c.json({ service });
    } catch (error) {
      if (String(error).includes('UNIQUE constraint failed')) {
        return c.json(
          { error: 'duplicate_slug', message: 'Ya existe un servicio con ese identificador.' },
          409,
        );
      }
      throw error;
    }
  },
);

adminRoutes.delete('/api/admin/services/:id', requireAdmin, async (c) => {
  const numeric = Number(c.req.param('id'));
  if (!Number.isInteger(numeric)) {
    return c.json({ error: 'bad_id', message: 'Identificador inválido.' }, 400);
  }

  const result = await deleteService(c.env.DB, numeric);
  if (result.deleted) return c.json({ ok: true, deleted: true });

  if (result.reason === 'in_use') {
    return c.json(
      {
        ok: true,
        deleted: false,
        message:
          'Ese servicio ya tiene citas registradas, así que se desactivó en lugar de borrarse. El historial se conserva.',
      },
    );
  }

  return c.json({ error: 'not_found', message: 'No existe.' }, 404);
});

// ── Fechas bloqueadas ──────────────────────────────────────────────────────

adminRoutes.get('/api/admin/blocked-dates', requireAdmin, async (c) => {
  return c.json({ dates: await listBlockedDates(c.env.DB) });
});

adminRoutes.post(
  '/api/admin/blocked-dates',
  requireAdmin,
  zValidator('json', blockedDateBodySchema, validationHook),
  async (c) => {
    const { date, reason } = c.req.valid('json');
    await blockDate(c.env.DB, date, reason);
    return c.json({ ok: true, date }, 201);
  },
);

adminRoutes.delete('/api/admin/blocked-dates/:date', requireAdmin, async (c) => {
  const date = c.req.param('date') as DateStr;
  await unblockDate(c.env.DB, date);
  return c.json({ ok: true });
});

// ── Ajustes ────────────────────────────────────────────────────────────────

adminRoutes.get('/api/admin/settings', requireAdmin, async (c) => {
  const config = await loadSiteConfig(c.env.DB);
  const services = await listServices(c.env.DB, { includeInactive: true });

  // Los ajustes se devuelven planos (clave → valor) para que el formulario sea
  // un binding directo sin transformaciones en el cliente.
  const { results } = await c.env.DB.prepare('SELECT key, value FROM settings').all<{
    key: string;
    value: string;
  }>();
  const flat: Record<string, string> = {};
  for (const row of results) if (row.key) flat[row.key] = row.value;

  return c.json({
    settings: flat,
    schedule: config.schedule,
    services,
    policy: config.policy,
  });
});

adminRoutes.put(
  '/api/admin/settings',
  requireAdmin,
  zValidator('json', settingsBodySchema, validationHook),
  async (c) => {
    // Varios campos usan z.coerce (llega '30' y sale 30), así que se serializa
// cualquier valor en vez de filtrar solo strings: `settings` es una tabla
// clave/valor de texto.
const entries = Object.entries(c.req.valid('json'))
      .filter((entry): entry is [string, string | number] => entry[1] !== undefined)
      .map(([key, value]): [string, string] => [key, String(value)]);

    if (entries.length === 0) {
      return c.json({ error: 'nothing_to_save', message: 'No llegó ningún cambio.' }, 400);
    }

    await saveSettings(c.env.DB, Object.fromEntries(entries));
    return c.json({ ok: true, updated: entries.length });
  },
);

adminRoutes.post(
  '/api/admin/change-password',
  requireAdmin,
  zValidator('json', changePasswordBodySchema, validationHook),
  async (c) => {
    const session = c.get('admin');
    const { currentPassword, newPassword } = c.req.valid('json');

    const admin = await findAdminByUsername(c.env.DB, session.username);
    if (!admin || !(await verifyPassword(currentPassword, admin.password_hash))) {
      return c.json(
        { error: 'bad_password', message: 'La contraseña actual no es correcta.' },
        401,
      );
    }

    await updateAdminPassword(c.env.DB, admin.id, await hashPassword(newPassword));
    return c.json({ ok: true });
  },
);

/**
 * Hash señuelo para igualar el tiempo de respuesta cuando el usuario no existe.
 * Debe tener el mismo coste que un hash real.
 */
const DUMMY_HASH =
  'pbkdf2$210000$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
