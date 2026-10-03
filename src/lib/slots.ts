/**
 * Rejilla de horarios y ocupación.
 *
 * El día se parte en bloques de `quantumMin` (30 por defecto). Un servicio de
 * duración `d` ocupa `ceil(d / quantum)` bloques consecutivos. Como solo se
 * atiende a una persona a la vez, basta con que esos bloques estén libres.
 *
 * La disponibilidad que calcula este módulo es una *cortesía*: evita ofrecer
 * un bloque ya ocupado. La garantía real de que no haya doble reserva vive en
 * `slot_holds` (PRIMARY KEY), dentro del motor de la base de datos. Aquí nunca
 * se decide un conflicto, solo se evita proponérselo a la clienta.
 *
 * Nota: la apertura y el cierre deben caer en múltiplos de `quantumMin`
 * (p.ej. 09:00 y 18:00 con quantum 30) para que la rejilla encaje limpia.
 */

import {
  addDays,
  dayOfWeekOf,
  diffDays,
  formatMinutes,
  localDateOf,
  localMinutesOf,
  parseMinutes,
  type DateStr,
  type DayWindow,
  type TimeStr,
} from './time.ts';

export interface SlotPolicy {
  /** Tamaño del bloque en minutos. */
  quantumMin: number;
  /** Minutos de separación obligatorios entre el final de una cita y la siguiente. */
  bufferMin: number;
  /** Anticipación mínima respecto a "ahora", en minutos. */
  minLeadMinutes: number;
  /** Máximo de días hacia adelante que se puede reservar. */
  horizonDays: number;
}

export interface AvailabilityQuery {
  date: DateStr;
  durationMin: number;
  policy: SlotPolicy;
  /** Ventana de atención de ese día; null = cerrado. */
  window: DayWindow | null;
  /** Instante actual (UTC) para aplicar la anticipación mínima. */
  now: Date;
  /** Bloques ya ocupados, como 'HH:MM'. */
  taken: ReadonlySet<TimeStr>;
}

/**
 * Cuántos bloques ocupa una reserva: el servicio más el buffer de separación.
 */
export function blocksNeeded(durationMin: number, policy: SlotPolicy): number {
  assertPositive(policy.quantumMin, 'quantumMin');
  assertPositive(durationMin, 'durationMin');
  return Math.ceil((durationMin + policy.bufferMin) / policy.quantumMin);
}

function assertPositive(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} debe ser un número positivo (recibido: ${value})`);
  }
}

/** Genera todos los inicios de bloque dentro de una ventana de atención. */
export function gridFor(window: DayWindow, quantumMin: number): TimeStr[] {
  assertPositive(quantumMin, 'quantumMin');
  const open = parseMinutes(window.open);
  const close = parseMinutes(window.close);
  if (close <= open) return [];

  const slots: TimeStr[] = [];
  for (let m = open; m < close; m += quantumMin) {
    slots.push(formatMinutes(m));
  }
  return slots;
}

/** Bloques consecutivos que ocuparía una reserva que empieza en `start`. */
export function blockRange(start: TimeStr, count: number, policy: SlotPolicy): TimeStr[] {
  const from = parseMinutes(start);
  return Array.from({ length: count }, (_, i) => formatMinutes(from + i * policy.quantumMin));
}

/**
 * Inicios de bloque libres para un servicio en una fecha dada.
 *
 * Un inicio es válido si la reserva completa cabe antes del cierre y ninguno
 * de los bloques que ocupa —servicio *y* buffer— está ya ocupado.
 */
export function availableSlots(query: AvailabilityQuery): TimeStr[] {
  const { date, durationMin, policy, window, now, taken } = query;

  if (!window) return [];

  const needed = blocksNeeded(durationMin, policy);
  const grid = gridFor(window, policy.quantumMin);
  if (grid.length < needed) return [];

  const earliest = earliestStart(date, now, policy, window);
  if (earliest === null) return [];

  return grid.filter((start, index) => {
    if (index + needed > grid.length) return false;
    const startMinutes = parseMinutes(start);
    if (startMinutes < earliest) return false;

    return blockRange(start, needed, policy).every((slot) => !taken.has(slot));
  });
}

/**
 * Minuto del primer bloque que respeta la anticipación mínima, o null si la
 * fecha ya no es reservable.
 */
function earliestStart(
  date: DateStr,
  now: Date,
  policy: SlotPolicy,
  window: DayWindow,
): number | null {
  const today = localDateOf(now);

  if (date < today) return null; // pasado
  if (date > today) return parseMinutes(window.open); // días futuros: día completo

  const target = localMinutesOf(now) + policy.minLeadMinutes;
  const rounded = Math.ceil(target / policy.quantumMin) * policy.quantumMin;
  return Math.max(rounded, parseMinutes(window.open));
}

/** Rango de fechas que la clienta puede reservar, en hora local. */
export function bookableRange(now: Date, horizonDays: number): DateStr[] {
  const today = localDateOf(now);
  return Array.from({ length: Math.max(0, horizonDays) + 1 }, (_, i) => addDays(today, i));
}

/**
 * Por qué no se puede reservar una fecha, o null si sí se puede.
 * Mensajes pensados para mostrarse tal cual a la clienta.
 */
export function rejectionReason(
  date: DateStr,
  now: Date,
  policy: SlotPolicy,
  window: DayWindow | null,
): string | null {
  const today = localDateOf(now);

  if (date < today) return 'Esa fecha ya pasó.';
  if (diffDays(today, date) > policy.horizonDays) {
    return `Solo se puede reservar con ${policy.horizonDays} días de anticipación.`;
  }
  if (window === null) return 'No atendemos ese día.';
  return null;
}

/** Ventana de atención de una fecha a partir del horario semanal. */
export function windowForDay(
  schedule: Record<string, DayWindow | null>,
  date: DateStr,
): DayWindow | null {
  return schedule[String(dayOfWeekOf(date))] ?? null;
}