/**
 * Configuración del negocio leída desde la tabla `settings`.
 *
 * IMPORTANTE — dos modos de uso según cuándo se ejecute:
 *
 *  · Durante el BUILD (páginas prerenderizadas): Astro corre en workerd con el
 *    binding D1 disponible, así que la configuración se hornea en el HTML. Es
 *    justo lo que necesitan los buscadores: el NAP (nombre, dirección, teléfono)
 *    presente en el código fuente de la página, no cargado por JavaScript.
 *
 *  · En TIEMPO DE EJECUCIÓN (rutas /api): se lee de D1 con el valor real del
 *    momento.
 *
 *  · En el NAVEGADOR: `fetch('/api/config')`. La landing prerenderizada muestra
 *    los valores horneados y luego los refresca con los actuales, para que un
 *    cambio de horario hecho en el panel se vea sin esperar un redespliegue.
 */

import { env } from 'cloudflare:workers';
import type { DateStr, DayWindow } from './time.ts';

export interface BusinessInfo {
  name: string;
  owner: string;
  tagline: string;
  phoneE164: string;
  phoneDisplay: string;
  whatsappE164: string;
  instagram: string;
  instagramHandle: string;
  address: string;
  city: string;
  department: string;
  country: string;
  geoLat: number;
  geoLng: number;
  paymentAccepted: string;
  contactEmail: string;
}

export interface BookingPolicy {
  minLeadMinutes: number;
  horizonDays: number;
  slotQuantumMin: number;
  cancellationHours: number;
  minimumAge: number;
  bufferMinutes: number;
}

export interface NotifyConfig {
  emailEnabled: boolean;
  emailRecipient: string;
}

export interface ServiceSummary {
  id: number;
  slug: string;
  name: string;
  description: string;
  durationMin: number;
  priceCop: number;
}

export interface SiteConfig {
  business: BusinessInfo;
  /** Clave '0'..'6' (0 = domingo). null = cerrado. */
  schedule: Record<string, DayWindow | null>;
  policy: BookingPolicy;
  notify: NotifyConfig;
  services: ServiceSummary[];
}

const SETTING_DEFAULTS = {
  'business.name': 'Soul and Body',
  'business.owner': 'Wendy de la Hoz',
  'business.tagline': 'Estética en Envigado',
  'business.phone_e164': '+573136147706',
  'business.phone_display': '313 614 7706',
  'business.whatsapp_e164': '573136147706',
  'business.instagram': 'https://www.instagram.com/wendydelahozestetica',
  'business.instagram_handle': '@wendydelahozestetica',
  'business.address': '',
  'business.city': 'Envigado',
  'business.department': 'Antioquia',
  'business.country': 'CO',
  'business.geo_lat': '6.1719',
  'business.geo_lng': '-75.5917',
  'business.payment_accepted': 'Efectivo, transferencia, Nequi, tarjeta',
  'admin.contact_email': '',
  'notify.email_enabled': '1',
  'notify.email_recipient': '',
  'booking.min_lead_minutes': '120',
  'booking.horizon_days': '60',
  'booking.slot_quantum_min': '30',
  'booking.cancellation_hours': '24',
  'booking.minimum_age': '18',
  'booking.buffer_minutes': '0',
} as const;

const FALLBACK_SCHEDULE: Record<string, DayWindow | null> = {
  '0': null,
  '1': { open: '09:00', close: '18:00' },
  '2': { open: '09:00', close: '18:00' },
  '3': { open: '09:00', close: '18:00' },
  '4': { open: '09:00', close: '18:00' },
  '5': { open: '09:00', close: '18:00' },
  '6': { open: '09:00', close: '18:00' },
};

export const STATUS_ACTIVE = ['pending', 'confirmed'] as const;
export type ActiveStatus = (typeof STATUS_ACTIVE)[number];

export const ALL_STATUSES = ['pending', 'confirmed', 'completed', 'cancelled', 'no_show'] as const;
export type AppointmentStatus = (typeof ALL_STATUSES)[number];

/** Lee la tabla settings y devuelve un mapa clave → valor. */
async function readSettings(db: D1Database): Promise<Record<string, string>> {
  const { results } = await db.prepare('SELECT key, value FROM settings').all<{
    key: string;
    value: string;
  }>();

  const map: Record<string, string> = { ...SETTING_DEFAULTS };
  for (const row of results) {
    if (row.key) map[row.key] = row.value;
  }
  return map;
}

function readSchedule(raw: string | undefined): Record<string, DayWindow | null> {
  if (!raw) return FALLBACK_SCHEDULE;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const schedule: Record<string, DayWindow | null> = {};
    for (let day = 0; day <= 6; day += 1) {
      const value = parsed[String(day)];
      if (value && typeof value === 'object' && 'open' in value && 'close' in value) {
        const entry = value as { open: string; close: string };
        schedule[String(day)] = { open: entry.open, close: entry.close };
      } else {
        schedule[String(day)] = null;
      }
    }
    return schedule;
  } catch {
    console.warn('[config] horario ilegible, se usa el de respaldo');
    return FALLBACK_SCHEDULE;
  }
}

function readNumber(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Carga la configuración completa. Acepta la base explícita para poder
 * testearla; por defecto usa el binding `DB` del entorno activo.
 */
export async function loadSiteConfig(db?: D1Database): Promise<SiteConfig> {
  const database = db ?? env.DB;
  const settings = await readSettings(database);

  const { results: serviceRows } = await database
    .prepare(
      `SELECT id, slug, name, description, duration_min, price_cop
         FROM services
        WHERE active = 1
        ORDER BY sort_order, id`,
    )
    .all<{
      id: number;
      slug: string;
      name: string;
      description: string;
      duration_min: number;
      price_cop: number;
    }>();

  const services: ServiceSummary[] = serviceRows.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    durationMin: row.duration_min,
    priceCop: row.price_cop,
  }));

  return {
    business: {
      name: settings['business.name'] ?? SETTING_DEFAULTS['business.name'],
      owner: settings['business.owner'] ?? SETTING_DEFAULTS['business.owner'],
      tagline: settings['business.tagline'] ?? SETTING_DEFAULTS['business.tagline'],
      phoneE164: settings['business.phone_e164'] ?? SETTING_DEFAULTS['business.phone_e164'],
      phoneDisplay: settings['business.phone_display'] ?? SETTING_DEFAULTS['business.phone_display'],
      whatsappE164:
        settings['business.whatsapp_e164'] ?? SETTING_DEFAULTS['business.whatsapp_e164'],
      instagram: settings['business.instagram'] ?? SETTING_DEFAULTS['business.instagram'],
      instagramHandle:
        settings['business.instagram_handle'] ?? SETTING_DEFAULTS['business.instagram_handle'],
      address: settings['business.address'] ?? '',
      city: settings['business.city'] ?? SETTING_DEFAULTS['business.city'],
      department: settings['business.department'] ?? SETTING_DEFAULTS['business.department'],
      country: settings['business.country'] ?? SETTING_DEFAULTS['business.country'],
      geoLat: readNumber(settings['business.geo_lat'], 6.1719),
      geoLng: readNumber(settings['business.geo_lng'], -75.5917),
      paymentAccepted:
        settings['business.payment_accepted'] ?? SETTING_DEFAULTS['business.payment_accepted'],
      contactEmail: settings['admin.contact_email'] ?? '',
    },
    schedule: readSchedule(settings['schedule']),
    policy: {
      minLeadMinutes: readNumber(settings['booking.min_lead_minutes'], 120),
      horizonDays: readNumber(settings['booking.horizon_days'], 60),
      slotQuantumMin: readNumber(settings['booking.slot_quantum_min'], 30),
      cancellationHours: readNumber(settings['booking.cancellation_hours'], 24),
      minimumAge: readNumber(settings['booking.minimum_age'], 18),
      bufferMinutes: readNumber(settings['booking.buffer_minutes'], 0),
    },
    notify: {
      emailEnabled: settings['notify.email_enabled'] === '1',
      emailRecipient: settings['notify.email_recipient'] ?? '',
    },
    services,
  };
}

/** Formatea un precio en pesos colombianos. */
export function formatPrice(cop: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(cop);
}

/** Enlace de WhatsApp con mensaje prellenado. */
export function whatsappLink(
  whatsappE164: string,
  message: string,
  base = 'https://wa.me',
): string {
  return `${base}/${whatsappE164}?text=${encodeURIComponent(message)}`;
}

/** Teléfono en formato E.164 para los datos estructurados. */
export function toE164(display: string, fallback = '+573136147706'): string {
  const digits = display.replace(/\D/g, '');
  return digits.length >= 10 ? `+${digits}` : fallback;
}

/** 'YYYY-MM-DD' → 'YYYY-MM-DDTHH:MM' con offset de Colombia. */
export function localIso(date: DateStr, time: string): string {
  return `${date}T${time}:00-05:00`;
}