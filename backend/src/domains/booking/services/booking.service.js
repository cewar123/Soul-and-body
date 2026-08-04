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
 *
 * Si el cliente está autenticado (opcional), la cita se asocia a su cuenta
 * para que pueda verla en "Mis citas" y cancelarla si necesita.
 *
 * Detección de carrera: si entre `assertSlotBookable` y el INSERT alguien tomó
 * el bloque, Supabase devuelve error 23505 (unique_violation) sobre el índice
 * parcial `idx_appointments_slot_active` → lo traducimos a SLOT_TAKEN.
 */
async function createBooking(input, meta = {}) {
  const { name, phone, email, service, date, time: timeStr, notes } = input;

  if (!validServiceIds.has(service)) {
    throw new DomainError('El servicio seleccionado no es válido.', 'SERVICE_INVALID');
  }

  await availability.assertSlotBookable(date, timeStr);

  let appointment = null;
  let lastError = null;
  for (let attempt = 0; attempt < 5 && !appointment; attempt += 1) {
    const reference = generateReference();
    try {
      appointment = await appointmentModel.create({
        reference,
        name,
        phone,
        email: email || null,
        service,
        date,
        time: timeStr,
        notes: notes || null,
        source_ip: meta.ip || null,
        customer_id: meta.customerId || null,
      });
    } catch (err) {
      lastError = err;
      // Carrera: alguien tomó el bloque entre la validación y el insert.
      if (err.code === '23505' && /idx_appointments_slot_active/.test(err.message || '')) {
        throw new DomainError(
          'Ese horario acaba de ser reservado. Elige otro, por favor.',
          'SLOT_TAKEN',
        );
      }
      // Colisión de reference (UNIQUE): reintentar con otro código.
      if (err.code === '23505' && /appointments_reference_key/.test(err.message || '')) {
        continue;
      }
      throw err;
    }
  }

  if (!appointment) {
    throw new Error(
      `No se pudo generar un código de reserva único: ${lastError ? lastError.message : 'desconocido'}`,
    );
  }

  logger.info(
    `Reserva creada ${appointment.reference} — ${serviceLabel(service)} ${date} ${timeStr}`,
  );

  let notifications = { owner: false, client: false, enabled: false };
  try {
    notifications = await emailService.sendBookingNotifications(appointment);
  } catch (err) {
    logger.warn(`Fallo enviando notificaciones: ${err.message}`);
  }

  return { appointment, notifications };
}

module.exports = { createBooking, generateReference };
