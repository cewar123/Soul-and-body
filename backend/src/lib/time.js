'use strict';

const config = require('../config');

/**
 * Helpers de fecha/hora conscientes de la zona horaria del negocio.
 *
 * Regla de oro del proyecto: TODA decisión de "qué día/hora es ahora" se toma
 * en la zona horaria del negocio (America/Bogota por defecto), no en la del
 * servidor, que puede estar en UTC u otro país al desplegar.
 */

const TZ = config.business.timezone;

/** Devuelve "YYYY-MM-DD" del momento dado, en la zona del negocio. */
function toBusinessDateStr(date = new Date()) {
  // en-CA produce el formato ISO YYYY-MM-DD de forma fiable.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** Devuelve "HH:MM" (24h) del momento dado, en la zona del negocio. */
function toBusinessTimeStr(date = new Date()) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

/** Día de la semana (0 = domingo ... 6 = sábado) en la zona del negocio. */
function businessWeekday(dateStr) {
  // Se ancla al mediodía para evitar que el desfase horario cambie el día.
  const d = new Date(`${dateStr}T12:00:00`);
  const name = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    weekday: 'short',
  }).format(d);
  return { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[name];
}

/** Convierte "HH:MM" a minutos desde medianoche. */
function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** Convierte minutos desde medianoche a "HH:MM". */
function toHHMM(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Diferencia en horas entre "ahora" y una fecha/hora de cita, calculada en la
 * zona del negocio. Positiva si la cita está en el futuro.
 *
 * Ambos instantes se construyen como hora local del proceso a partir de la
 * misma "hora de pared" del negocio; como Bogotá no tiene horario de verano,
 * la diferencia relativa entre ambos es exacta e independiente de la TZ del
 * servidor.
 */
function hoursUntil(dateStr, timeStr) {
  const now = getBusinessNowParts();
  const target = new Date(`${dateStr}T${timeStr}:00`);
  const nowAnchor = new Date(`${now.dateStr}T${now.timeStr}:00`);
  return (target - nowAnchor) / (1000 * 60 * 60);
}

/** Partes "ahora" (fecha y hora) en la zona del negocio. */
function getBusinessNowParts() {
  const now = new Date();
  return { dateStr: toBusinessDateStr(now), timeStr: toBusinessTimeStr(now) };
}

/** Suma N días a una fecha "YYYY-MM-DD" y devuelve "YYYY-MM-DD". */
function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + days);
  return toBusinessDateStr(d);
}

module.exports = {
  TZ,
  toBusinessDateStr,
  toBusinessTimeStr,
  businessWeekday,
  toMinutes,
  toHHMM,
  hoursUntil,
  getBusinessNowParts,
  addDays,
};
