import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';

import {
  createAppointment,
  findServiceById,
  isDateBlocked,
  takenSlotsFor,
  type NewAppointment,
} from '../../lib/repository.ts';
import {
  availableSlots,
  blockRange,
  blocksNeeded,
  bookableRange,
  rejectionReason,
  windowForDay,
  type SlotPolicy,
} from '../../lib/slots.ts';
import { formatPrice, loadSiteConfig, whatsappLink } from '../../lib/config.ts';
import { availabilityQuerySchema, bookingBodySchema } from '../../lib/validation.ts';
import { validationHook } from '../lib/validation.ts';
import { generateReference } from '../../lib/normalize.ts';
import { humanDate, isValidDate, type DateStr } from '../../lib/time.ts';
import { clientIp, consumeRateLimit, RATE_LIMITS } from '../lib/rateLimit.ts';
import { verifyTurnstile } from '../lib/turnstile.ts';
import type { AppEnv } from '../app.ts';

/** Rutas públicas. Ninguna requiere sesión y ninguna devuelve datos personales. */
export const publicRoutes = new Hono<AppEnv>();

/** Adapta la política del negocio al shape que espera `availableSlots`. */
function toSlotPolicy(policy: {
  slotQuantumMin: number;
  bufferMinutes: number;
  minLeadMinutes: number;
  horizonDays: number;
}): SlotPolicy {
  return {
    quantumMin: policy.slotQuantumMin,
    bufferMin: policy.bufferMinutes,
    minLeadMinutes: policy.minLeadMinutes,
    horizonDays: policy.horizonDays,
  };
}

// ── GET /api/config ─────────────────────────────────────────────────────────

/**
 * Configuración para el navegador. Es la única fuente de verdad en el cliente:
 * si cambia un precio o un horario desde el panel, el widget usa el valor nuevo
 * sin esperar un redespliegue.
 */
publicRoutes.get('/api/config', async (c) => {
  const config = await loadSiteConfig(c.env.DB);

  return c.json(
    {
      business: {
        name: config.business.name,
        owner: config.business.owner,
        phoneE164: config.business.phoneE164,
        phoneDisplay: config.business.phoneDisplay,
        whatsappE164: config.business.whatsappE164,
        address: config.business.address,
        city: config.business.city,
        department: config.business.department,
      },
      policy: config.policy,
      services: config.services.map((service) => ({
        ...service,
        priceFormatted: formatPrice(service.priceCop),
      })),
      // Clave pública de Turnstile: es pública por diseño, el secreto vive en el
      // Worker. Vacía (valor por defecto) = el widget omite el challenge.
      turnstileSiteKey: c.env.TURNSTILE_SITE_KEY,
    },
    // Cambia poco y es público: un minuto de caché aligera D1 sin estalar.
    { headers: { 'Cache-Control': 'public, max-age=60' } },
  );
});

// ── GET /api/availability ───────────────────────────────────────────────────

interface DaySummary {
  date: DateStr;
  open: boolean;
  available: boolean;
  reason: string | null;
}

/**
 * Dos modos según lo que pida el cliente:
 *  · `date`  → los horarios libres de ese día.
 *  · `month` → un resumen día a día, para pintar el calendario.
 */
publicRoutes.get(
  '/api/availability',
  zValidator('query', availabilityQuerySchema, validationHook),
  async (c) => {
    const limit = await consumeRateLimit(c.env.DB, clientIp(c.req.raw), RATE_LIMITS.availability);
    if (!limit.allowed) {
      return c.json(
        { error: 'rate_limited', message: 'Demasiadas consultas. Espera un momento.' },
        429,
      );
    }

    const { service: serviceId, date, month } = c.req.valid('query');
  const config = await loadSiteConfig(c.env.DB);
  const policy = toSlotPolicy(config.policy);
  const now = new Date();

  const service = await findServiceById(c.env.DB, serviceId);
  if (!service?.active) {
    return c.json(
      { error: 'service_not_found', message: 'Ese servicio no está disponible.' },
      404,
    );
  }

  if (month && !date) {
    const [year, monthNumber] = month.split('-').map(Number) as [number, number];
    const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
    const horizonEnd = bookableRange(now, policy.horizonDays).at(-1) ?? '';
    const days: DaySummary[] = [];

    for (let day = 1; day <= daysInMonth; day += 1) {
      const iso = `${month}-${String(day).padStart(2, '0')}`;
      if (!isValidDate(iso)) continue;

      const window = windowForDay(config.schedule, iso);
      const rejection = rejectionReason(iso, now, policy, window);
      const blocked = await isDateBlocked(c.env.DB, iso);

      days.push({
        date: iso,
        open: window !== null,
        available: rejection === null && !blocked,
        reason: rejection ?? (blocked ? 'No hay atención ese día.' : null),
      });
    }

    return c.json({ month, horizonEnd, days });
  }

  if (!date) {
    return c.json(
      { error: 'invalid_query', message: 'Indica un día (date) o un mes (month).' },
      422,
    );
  }

  const window = windowForDay(config.schedule, date);
  const rejection = rejectionReason(date, now, policy, window);
  const blocked = await isDateBlocked(c.env.DB, date);

  if (rejection || blocked) {
    return c.json({
      date,
      serviceId: service.id,
      durationMin: service.durationMin,
      slots: [] as string[],
      reason: rejection ?? 'No hay atención ese día.',
    });
  }

  const taken = await takenSlotsFor(c.env.DB, date);
  const slots = availableSlots({
    date,
    durationMin: service.durationMin,
    policy,
    window,
    now,
    taken,
  });

  return c.json({
    date,
    serviceId: service.id,
    durationMin: service.durationMin,
    slots,
    reason: slots.length === 0 ? 'No quedan horarios libres ese día.' : null,
  });
  },
);

// ── POST /api/bookings ──────────────────────────────────────────────────────

const BOOKING_FAILURES = {
  slot_taken: {
    status: 409,
    body: {
      error: 'slot_taken',
      message: 'Ese horario se acaba de ocupar. Elige otro, por favor.',
    },
  },
  reference_collision: {
    status: 409,
    body: { error: 'retry', message: 'Inténtalo de nuevo en un momento.' },
  },
  unknown: {
    status: 500,
    body: { error: 'unknown', message: 'No pudimos reservar. Inténtalo de nuevo.' },
  },
} as const;

publicRoutes.post('/api/bookings', zValidator('json', bookingBodySchema, validationHook), async (c) => {
  const body = c.req.valid('json');
  const db = c.env.DB;
  const ip = clientIp(c.req.raw);

  const limit = await consumeRateLimit(db, ip, RATE_LIMITS.booking);
  if (!limit.allowed) {
    c.header('Retry-After', String(limit.retryAfter));
    return c.json(
      {
        error: 'rate_limited',
        message: 'Has hecho demasiadas reservas desde esta conexión. Inténtalo más tarde.',
      },
      429,
    );
  }

  const turnstile = await verifyTurnstile(c.req.raw, body.turnstileToken, {
    secret: c.env.TURNSTILE_SECRET_KEY,
    remoteIp: ip,
  });
  if (turnstile.outcome === 'fail') {
    return c.json(
      {
        error: 'captcha_failed',
        message: 'No pudimos verificar que eres una persona. Recarga e inténtalo otra vez.',
      },
      400,
    );
  }

  const config = await loadSiteConfig(db);
  const policy = toSlotPolicy(config.policy);
  const now = new Date();

  // Ley 1799 de 2016: no se practican procedimientos estéticos en menores.
  if (body.age !== undefined && body.age < config.policy.minimumAge) {
    return c.json(
      {
        error: 'age_not_allowed',
        message: `Solo atendemos a mayores de ${config.policy.minimumAge} años.`,
      },
      422,
    );
  }

  const service = await findServiceById(db, body.serviceId);
  if (!service?.active) {
    return c.json(
      { error: 'service_not_found', message: 'Ese servicio no está disponible.' },
      404,
    );
  }

  const window = windowForDay(config.schedule, body.date);
  const rejection = rejectionReason(body.date, now, policy, window);
  const blocked = await isDateBlocked(db, body.date);
  if (rejection || blocked) {
    return c.json(
      { error: 'date_unavailable', message: rejection ?? 'No hay atención ese día.' },
      422,
    );
  }

  // Comprobación de cortesía antes de escribir: da un mensaje mejor que un 500.
  // La garantía real sigue siendo el índice único de slot_holds.
  const taken = await takenSlotsFor(db, body.date);
  const validSlots = availableSlots({
    date: body.date,
    durationMin: service.durationMin,
    policy,
    window,
    now,
    taken,
  });

  if (!validSlots.includes(body.time)) {
    return c.json(
      {
        error: 'slot_unavailable',
        message: 'Ese horario ya no está disponible. Elige otro, por favor.',
      },
      409,
    );
  }

  const input: NewAppointment = {
    serviceId: service.id,
    clientName: body.name,
    clientPhone: body.phone,
    clientEmail: body.email || null,
    clientNotes: body.notes,
    clientAge: body.age ?? null,
    date: body.date,
    time: body.time,
    durationMin: service.durationMin,
    slots: blockRange(body.time, blocksNeeded(service.durationMin, policy), policy),
    sourceIp: ip === 'unknown' ? null : ip,
    consentHealth: body.consentHealth,
    consentContact: body.consentContact,
  };

  // Un choque de referencia es estadísticamente casi imposible, pero reintentar
  // una vez cuesta nada y deja el sistema a prueba del azar.
  let result = await createAppointment(db, input);
  if (!result.ok && result.reason === 'reference_collision') {
    result = await createAppointment(db, input, generateReference());
  }

  if (!result.ok) {
    const failure = BOOKING_FAILURES[result.reason];
    return c.json(failure.body, failure.status);
  }

  const appointment = result.appointment;
  const ownerFirstName = config.business.name.split(' ')[0] ?? config.business.name;

  return c.json(
    {
      reference: appointment.reference,
      date: appointment.date,
      time: appointment.time,
      durationMin: appointment.durationMin,
      service: { id: service.id, name: service.name, slug: service.slug },
      status: appointment.status,
      summary: `${service.name} · ${humanDate(appointment.date)} · ${appointment.time}`,
      whatsappLink: whatsappLink(
        config.business.whatsappE164,
        `Hola ${ownerFirstName}, acabo de reservar desde la web. Mi código es ${appointment.reference}.`,
      ),
      notice:
        'Tu cita quedó reservada. Te escribimos por WhatsApp para confirmar los detalles. Si necesitas cambiarla, responde a ese mensaje.',
    },
    201,
  );
});