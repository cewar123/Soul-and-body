'use strict';

const config = require('../../../config');
const appointmentModel = require('../models/appointment.model');
const time = require('../../../lib/time');
const { DomainError } = require('../../../lib/errors');

const { schedule, slotMinutes, minLeadTimeHours, bookingHorizonDays, blackoutDates } =
  config.business;

/** ¿La fecha (YYYY-MM-DD) es un día laborable y no está bloqueada? */
function isWorkingDay(dateStr) {
  if (blackoutDates.includes(dateStr)) return false;
  const weekday = time.businessWeekday(dateStr);
  return Boolean(schedule[weekday]);
}

/**
 * Genera TODOS los bloques teóricos de un día laborable, según su horario.
 * No considera aún ocupación ni hora actual.
 */
function allSlotsForDate(dateStr) {
  const weekday = time.businessWeekday(dateStr);
  const day = schedule[weekday];
  if (!day) return [];
  const start = time.toMinutes(day.open);
  const end = time.toMinutes(day.close);
  const slots = [];
  for (let m = start; m + slotMinutes <= end; m += slotMinutes) {
    slots.push(time.toHHMM(m));
  }
  return slots;
}

/** Valida que la fecha esté dentro del rango permitido para reservar. */
function assertDateBookable(dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    throw new DomainError('Fecha con formato inválido.', 'DATE_FORMAT');
  }
  const today = time.getBusinessNowParts().dateStr;
  const horizon = time.addDays(today, bookingHorizonDays);

  if (dateStr < today) throw new DomainError('Esa fecha ya pasó.', 'DATE_PAST');
  if (dateStr > horizon) {
    throw new DomainError(
      `Solo se puede reservar hasta ${bookingHorizonDays} días por adelantado.`,
      'DATE_HORIZON'
    );
  }
  if (!isWorkingDay(dateStr)) {
    throw new DomainError('Ese día no hay atención.', 'DATE_CLOSED');
  }
}

/** Valida que un bloque concreto (date, time) sea reservable. */
function assertSlotBookable(dateStr, timeStr) {
  assertDateBookable(dateStr);
  if (!/^\d{2}:\d{2}$/.test(timeStr)) {
    throw new DomainError('Hora con formato inválido.', 'TIME_FORMAT');
  }
  const validSlots = new Set(allSlotsForDate(dateStr));
  if (!validSlots.has(timeStr)) {
    throw new DomainError('Ese horario no está disponible en el calendario.', 'TIME_INVALID');
  }
  if (time.hoursUntil(dateStr, timeStr) < minLeadTimeHours) {
    throw new DomainError('La reserva debe hacerse con al menos 2 horas de anticipación.', 'LEAD_TIME');
  }
  if (appointmentModel.slotIsTaken(dateStr, timeStr)) {
    throw new DomainError('Ese horario ya está reservado.', 'SLOT_TAKEN');
  }
}

/**
 * Devuelve la disponibilidad de un día: cada bloque con su estado.
 * Un bloque está disponible si (a) no está ocupado y (b) respeta la
 * anticipación mínima respecto a la hora actual del negocio.
 */
function getAvailability(dateStr) {
  assertDateBookable(dateStr);

  const taken = appointmentModel.takenTimes(dateStr);

  const slots = allSlotsForDate(dateStr).map((slot) => {
    const isTaken = taken.has(slot);
    const leadOk = time.hoursUntil(dateStr, slot) >= minLeadTimeHours;
    return { time: slot, available: !isTaken && leadOk };
  });

  return {
    date: dateStr,
    slots,
  };
}

module.exports = {
  isWorkingDay,
  allSlotsForDate,
  assertDateBookable,
  assertSlotBookable,
  getAvailability,
};
