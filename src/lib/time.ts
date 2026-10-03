/**
 * Manejo de fecha y hora local de Colombia.
 *
 * Colombia es UTC-5 todo el año (el horario de verano se abolió en 1992), así
 * que un desfase fijo es exacto y evita meter `Intl`/`Temporal` en el hot path.
 *
 * Decisión de diseño: en la base de datos `date` y `time` se guardan como TEXTO
 * en hora local ('YYYY-MM-DD' y 'HH:MM'). Nunca UTC. Así una consulta
 * `WHERE date = '2026-11-10'` significa literalmente "ese día en el consultorio",
 * los índices funcionan sin transformaciones y no existe forma de que una
 * conversión de zona horaria corrompa una cita.
 */

export const COLOMBIA_UTC_OFFSET_MINUTES = -5 * 60;

export type DateStr = string; // 'YYYY-MM-DD'
export type TimeStr = string; // 'HH:MM'

export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = domingo

export interface DayWindow {
  open: TimeStr;
  close: TimeStr;
}

/** Momento actual en el consultorio. */
export interface BusinessNow {
  date: DateStr;
  time: TimeStr;
  dayOfWeek: DayOfWeek;
  /** Minutos desde medianoche. */
  minutes: number;
}

/** Desplaza un instante UTC a la hora local de Colombia. */
export function toColombia(instant: Date): Date {
  return new Date(instant.getTime() + COLOMBIA_UTC_OFFSET_MINUTES * 60_000);
}

/** 'YYYY-MM-DD' en hora local de Colombia a partir de un instante UTC. */
export function localDateOf(instant: Date): DateStr {
  const local = toColombia(instant);
  return `${local.getUTCFullYear()}-${pad2(local.getUTCMonth() + 1)}-${pad2(local.getUTCDate())}`;
}

/** Minutos desde medianoche en hora local de Colombia. */
export function localMinutesOf(instant: Date): number {
  const local = toColombia(instant);
  return local.getUTCHours() * 60 + local.getUTCMinutes();
}

export function businessNow(instant: Date = new Date()): BusinessNow {
  const date = localDateOf(instant);
  const minutes = localMinutesOf(instant);
  return {
    date,
    time: formatMinutes(minutes),
    dayOfWeek: dayOfWeekOf(date),
    minutes,
  };
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** 'HH:MM' → minutos desde medianoche. Lanza si el formato es inválido. */
export function parseMinutes(time: TimeStr): number {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) throw new RangeError(`Hora inválida: ${time}`);
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) throw new RangeError(`Hora fuera de rango: ${time}`);
  return hours * 60 + minutes;
}

export function formatMinutes(total: number): TimeStr {
  if (!Number.isInteger(total) || total < 0 || total > 1439) {
    throw new RangeError(`Minutos fuera de rango: ${total}`);
  }
  return `${pad2(Math.floor(total / 60))}:${pad2(total % 60)}`;
}

export function isValidTime(time: string): boolean {
  if (!/^\d{2}:\d{2}$/.test(time)) return false;
  const [hours, minutes] = time.split(':').map(Number);
  return hours !== undefined && hours <= 23 && minutes !== undefined && minutes <= 59;
}

/**
 * Descompone 'YYYY-MM-DD' en (año, mes, día).
 *
 * Lanza si el formato no es válido. Es deliberado: estas funciones son internas
 * y sus entradas ya pasaron por `isValidDate` o por los schemas de Zod en el
 * borde de la API. Ante una fecha corrupta es mejor que reviente aquí, en el
 * cálculo, y no que se cuele un 1970 silencioso en una reserva.
 */
export function dateParts(date: DateStr): { year: number; month: number; day: number } {
  const [year, month, day] = date.split('-').map(Number);
  if (year === undefined || month === undefined || day === undefined) {
    throw new RangeError(`Fecha inválida: ${date}`);
  }
  return { year, month, day };
}

export function isValidDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const { year, month, day } = dateParts(date);
  if (month < 1 || month > 12 || day < 1) return false;
  // Rechaza fechas que no existen (p.ej. 2026-02-31).
  const probe = new Date(Date.UTC(year, month - 1, day));
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  );
}

export function dayOfWeekOf(date: DateStr): DayOfWeek {
  const { year, month, day } = dateParts(date);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay() as DayOfWeek;
}

/** Suma días a una fecha local sin pasar por UTC ni por zona horaria. */
export function addDays(date: DateStr, days: number): DateStr {
  const { year, month, day } = dateParts(date);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return `${shifted.getUTCFullYear()}-${pad2(shifted.getUTCMonth() + 1)}-${pad2(shifted.getUTCDate())}`;
}

/** Días entre dos fechas locales (b - a). */
export function diffDays(a: DateStr, b: DateStr): number {
  const from = dateParts(a);
  const to = dateParts(b);
  const fromMs = Date.UTC(from.year, from.month - 1, from.day);
  const toMs = Date.UTC(to.year, to.month - 1, to.day);
  return Math.round((toMs - fromMs) / 86_400_000);
}

export const WEEKDAY_LABELS_ES: Record<DayOfWeek, string> = {
  0: 'domingo',
  1: 'lunes',
  2: 'martes',
  3: 'miércoles',
  4: 'jueves',
  5: 'viernes',
  6: 'sábado',
};

const MONTH_NAMES_ES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
] as const;

/** '2026-11-10' → 'martes 10 de noviembre' */
export function humanDate(date: DateStr): string {
  const { month, day } = dateParts(date);
  const monthName = MONTH_NAMES_ES[month - 1] ?? '';
  return `${WEEKDAY_LABELS_ES[dayOfWeekOf(date)]} ${day} de ${monthName}`;
}