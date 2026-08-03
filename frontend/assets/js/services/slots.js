/**
 * Soul and Body — Helpers de fecha y horas para la UI.
 * Reflejan la lógica del backend (zona horaria del negocio).
 * @module services/slots
 */

const TIMEZONE = 'America/Bogota'; // Por defecto; el config puede sobrescribirlo.

/** Devuelve "YYYY-MM-DD" de hoy en la zona horaria del negocio. */
export function businessToday(timezone = TIMEZONE) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

/** Suma N días a una fecha "YYYY-MM-DD" y devuelve "YYYY-MM-DD". */
export function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + n);
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

/** Día de la semana (0=domingo ... 6=sábado) en la zona del negocio. */
export function businessWeekday(dateStr, timezone = TIMEZONE) {
  const d = new Date(`${dateStr}T12:00:00`);
  const name = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone, weekday: 'short',
  }).format(d);
  return { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[name];
}

/** Formatea una fecha a texto largo en español (CO). */
export function formatHumanDate(dateStr, timezone = TIMEZONE) {
  const d = new Date(`${dateStr}T12:00:00`);
  return new Intl.DateTimeFormat('es-CO', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: timezone,
  }).format(d);
}

/** Formatea una fecha a "DD MMM YYYY" en español (CO). */
export function formatShortDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
}
