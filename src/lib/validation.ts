import { z } from 'zod';
import { isValidDate, isValidTime } from './time.ts';
import { cleanText, normalizeName, normalizePhoneCol } from './normalize.ts';

/**
 * Esquemas de validación (Zod 4).
 *
 * Toda entrada externa —cuerpo JSON, query string, formularios— pasa por aquí.
 * Los mensajes están en español y están escritos para mostrarse tal cual a la
 * clienta, porque es lo que ve si algo falla.
 */

// --- Primitivas reutilizables ------------------------------------------------

/** Teléfono colombiano, normalizado a E.164. */
export const phoneSchema = z
  .string()
  .trim()
  .min(7, 'Escribe un número de celular válido.')
  .max(30, 'El número es demasiado largo.')
  .transform((value, ctx) => {
    const e164 = normalizePhoneCol(value);
    if (!e164) {
      ctx.addIssue({
        code: 'custom',
        message: 'Ese número no parece un celular colombiano válido.',
      });
      return z.NEVER;
    }
    return e164;
  });

export const emailSchema = z
  .string()
  .trim()
  .max(160, 'El correo es demasiado largo.')
  .transform((value) => value.toLowerCase())
  .refine((value) => value === '' || z.email().safeParse(value).success, {
    message: 'Ese correo no parece válido.',
  });

export const nameSchema = z
  .string()
  .trim()
  .min(2, 'Escribe tu nombre.')
  .max(120, 'El nombre es demasiado largo.')
  .transform(normalizeName);

/**
 * Comentario libre. Se trunca en lugar de rechazarse: que alguien escriba 2000
 * caracteres no debería impedir hacer la reserva. El `.max(5000)` previo es solo
 * una guarda barata contra cargas gigantes, no una regla de negocio.
 */
export const notesSchema = z
  .string()
  .trim()
  .max(5000)
  .transform((value) => cleanText(value, 800))
  .transform((value) => (value === '' ? null : value))
  .nullable()
  .optional()
  .default(null);

export const dateSchema = z
  .string()
  .refine(isValidDate, { message: 'Esa fecha no existe.' });

export const timeSchema = z.string().refine(isValidTime, { message: 'Esa hora no es válida.' });

export const idSchema = z.coerce.number().int().positive();

// --- Configuración pública --------------------------------------------------

/**
 * Consulta de disponibilidad. Acepta un día concreto o un mes entero para
 * pintar el calendario, pero al menos uno de los dos.
 */
export const availabilityQuerySchema = z
  .object({
    service: idSchema,
    date: dateSchema.optional(),
    month: z
      .string()
      .regex(/^\d{4}-\d{2}$/, 'Usa el formato AAAA-MM.')
      .optional(),
  })
  .refine((value) => Boolean(value.date ?? value.month), {
    error: 'Indica un día (date) o un mes (month).',
  });

export type AvailabilityQueryInput = z.infer<typeof availabilityQuerySchema>;

// --- Creación de cita --------------------------------------------------------

export const bookingBodySchema = z.object({
  serviceId: idSchema,
  date: dateSchema,
  time: timeSchema,

  name: nameSchema,
  phone: phoneSchema,
  email: emailSchema.optional().default(''),
  notes: notesSchema,

  /** Edad de la clienta. La Ley 1799 de 2016 prohíbe atender menores. */
  age: z.coerce.number().int().min(0).max(120).optional(),

  /**
   * Consentimiento EXPLÍCITO para datos sensibles de salud (Ley 1581/2012).
   * Obligatorio y separado del consentimiento de contacto.
   */
  consentHealth: z.literal(true, {
    error: 'Necesitamos tu autorización para tratar los datos de salud.',
  }),

  /** Consentimiento para recibir comunicaciones. Opcional. */
  consentContact: z.boolean().optional().default(false),

  /** Token de Cloudflare Turnstile. */
  turnstileToken: z.string().trim().max(2048).optional().default(''),
});

export type BookingBody = z.infer<typeof bookingBodySchema>;

// --- Autenticación del panel -------------------------------------------------

export const loginBodySchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, 'El usuario es demasiado corto.')
    .max(60, 'El usuario es demasiado largo.')
    .transform((value) => value.toLowerCase()),
  password: z.string().min(8, 'La contraseña es demasiado corta.').max(200),
});

export const changePasswordBodySchema = z
  .object({
    currentPassword: z.string().min(1, 'Escribe tu contraseña actual.').max(200),
    newPassword: z
      .string()
      .min(12, 'Usa al menos 12 caracteres.')
      .max(200)
      .refine((value) => /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value), {
        message: 'Combina mayúsculas, minúsculas y números.',
      }),
  })
  .refine((value) => value.currentPassword !== value.newPassword, {
    message: 'La contraseña nueva debe ser distinta de la actual.',
  });

// --- Gestión de citas (panel) -----------------------------------------------

export const STATUS_VALUES = ['pending', 'confirmed', 'completed', 'cancelled', 'no_show'] as const;
export const statusSchema = z.enum(STATUS_VALUES);
export type Status = (typeof STATUS_VALUES)[number];

export const updateStatusBodySchema = z.object({
  status: statusSchema,
});

export const appointmentListQuerySchema = z.object({
  date: dateSchema.optional(),
  from: dateSchema.optional(),
  to: dateSchema.optional(),
  status: statusSchema.optional(),
  q: z.string().trim().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
  offset: z.coerce.number().int().min(0).max(10_000).optional().default(0),
});

// --- Gestión de servicios (panel) -------------------------------------------

export const slugSchema = z
  .string()
  .trim()
  .min(2, 'El identificador es demasiado corto.')
  .max(60, 'El identificador es demasiado largo.')
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Usa minúsculas, números y guiones. Ej: drenaje-linfatico.');

export const serviceBodySchema = z.object({
  slug: slugSchema,
  name: z.string().trim().min(2, 'Escribe el nombre.').max(120),
  description: z.string().trim().max(1000).optional().default(''),
  durationMin: z.coerce
    .number()
    .int()
    .min(15, 'La duración mínima es de 15 minutos.')
    .max(480, 'La duración máxima es de 8 horas.'),
  priceCop: z.coerce.number().int().min(0, 'El precio no puede ser negativo.').max(100_000_000),
  active: z.boolean().optional().default(true),
  sortOrder: z.coerce.number().int().min(0).max(9999).optional().default(0),
});

export const serviceUpdateSchema = serviceBodySchema.partial();

// --- Fechas bloqueadas -------------------------------------------------------

export const blockedDateBodySchema = z.object({
  date: dateSchema,
  reason: z.string().trim().max(160).optional().default(''),
});

// --- Ajustes -----------------------------------------------------------------

/** Un objeto de 'HH:MM' → 'HH:MM' o null (cerrado). */
const dayWindowSchema = z
  .union([
    z.object({
      open: timeSchema,
      close: timeSchema,
    }),
    z.null(),
  ])
  .refine(
    (value) => value === null || value.open < value.close,
    'La apertura debe ser anterior al cierre.',
  );

export const settingsBodySchema = z.object({
  'business.name': z.string().trim().min(1).max(120).optional(),
  'business.owner': z.string().trim().min(1).max(120).optional(),
  'business.tagline': z.string().trim().max(160).optional(),
  'business.phone_e164': phoneSchema.optional(),
  'business.phone_display': z.string().trim().max(40).optional(),
  'business.whatsapp_e164': phoneSchema.optional(),
  'business.instagram': z.url().optional(),
  'business.instagram_handle': z.string().trim().max(80).optional(),
  'business.address': z.string().trim().max(200).optional(),
  'business.city': z.string().trim().max(80).optional(),
  'business.department': z.string().trim().max(80).optional(),
  'business.country': z.string().trim().length(2).optional(),
  'business.geo_lat': z.coerce.number().min(-90).max(90).optional(),
  'business.geo_lng': z.coerce.number().min(-180).max(180).optional(),
  'business.payment_accepted': z.string().trim().max(200).optional(),
  'admin.contact_email': emailSchema.optional(),
  'notify.email_enabled': z.enum(['0', '1']).optional(),
  'notify.email_recipient': emailSchema.optional(),
  'booking.min_lead_minutes': z.coerce.number().int().min(0).max(20_160).optional(),
  'booking.horizon_days': z.coerce.number().int().min(1).max(365).optional(),
  'booking.slot_quantum_min': z.union([z.literal(15), z.literal(30), z.literal(60)]).optional(),
  'booking.cancellation_hours': z.coerce.number().int().min(0).max(720).optional(),
  'booking.minimum_age': z.coerce.number().int().min(0).max(120).optional(),
  'booking.buffer_minutes': z.coerce.number().int().min(0).max(120).optional(),
  schedule: z
    .record(z.string(), dayWindowSchema)
    .optional()
    .transform((value) => (value === undefined ? undefined : JSON.stringify(value))),
});