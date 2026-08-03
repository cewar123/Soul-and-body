'use strict';

const crypto = require('crypto');
const appointmentModel = require('../models/appointment.model');
const availability = require('./availability.service');
const emailService = require('../../notifications/email.service');
const { serviceLabel } = require('../../../lib/format');
const config = require('../../../config');
const logger = require('../../../lib/logger');
const { DomainError } = require('../../../lib/errors');

const validServiceIds = new Set(config.business.services.map((s) => s.id));

// Alfabeto sin caracteres ambiguos (0/O, 1/I) para códigos legibles por teléfono.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateReference() {
  let code = '';
  const bytes = crypto.randomBytes(6);
  for (let i = 0; i < 6; i += 1) code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return `SB-${code}`;
}

/**
 * Crea una reserva a partir de datos YA validados y saneados por el middleware.
 * Devuelve { appointment, notifications }.
 */
async function createBooking(input, meta = {}) {
  const { name, phone, email, service, date, time: timeStr, notes } = input;

  if (!validServiceIds.has(service)) {
    throw new DomainError('El servicio seleccionado no es válido.', 'SERVICE_INVALID');
  }

  // Regla de negocio: día/hora deben ser reservables (fecha, horario, ocupación).
  availability.assertSlotBookable(date, timeStr);

  // Se reintenta solo ante una colisión de código de referencia (extremadamente raro).
  let appointment = null;
  for (let attempt = 0; attempt < 5 && !appointment; attempt += 1) {
    const reference = generateReference();
    try {
      appointment = appointmentModel.create({
        reference,
        name,
        phone,
        email: email || null,
        service,
        date,
        time: timeStr,
        notes: notes || null,
        source_ip: meta.ip || null,
      });
    } catch (err) {
      // Índice único parcial: alguien tomó el bloque entre la validación y el insert.
      if (String(err.message).includes('idx_appointments_slot_active')) {
        throw new DomainError(
          'Ese horario acaba de ser reservado. Elige otro, por favor.',
          'SLOT_TAKEN'
        );
      }
      // Colisión de reference (UNIQUE): reintentar con otro código.
      if (String(err.message).includes('appointments.reference')) {
        continue;
      }
      throw err;
    }
  }

  if (!appointment) {
    throw new Error('No se pudo generar un código de reserva único.');
  }

  logger.info(
    `Reserva creada ${appointment.reference} — ${serviceLabel(service)} ${date} ${timeStr}`
  );

  // Notificaciones best-effort: nunca deben tumbar la reserva.
  let notifications = { owner: false, client: false, enabled: false };
  try {
    notifications = await emailService.sendBookingNotifications(appointment);
  } catch (err) {
    logger.warn(`Fallo enviando notificaciones: ${err.message}`);
  }

  return { appointment, notifications };
}

module.exports = { createBooking, generateReference };
