'use strict';

const crypto = require('crypto');
const express = require('express');
const supabase = require('../db/connection');
const config = require('../config');
const logger = require('../lib/logger');
const time = require('../lib/time');
const asyncHandler = require('../lib/asyncHandler');
const { serviceLabel } = require('../lib/format');
const { DomainError } = require('../lib/errors');
const { bookingRules, availabilityRules } = require('../middleware/validate');
const { bookingLimiter } = require('../middleware/rateLimit');
const { csrfProtection } = require('../middleware/csrf');
const customerSession = require('../middleware/customerSession');
const emailService = require('./notifications');

const { activeStatuses } = config.business;
const { schedule, slotMinutes, minLeadTimeHours, bookingHorizonDays, blackoutDates } =
  config.business;
const validServiceIds = new Set(config.business.services.map((s) => s.id));

/**
 * Acceso a la tabla `appointments` sobre Supabase (PostgreSQL).
 * Todas las consultas pasan por el cliente JS con service_role.
 * El índice único parcial `idx_appointments_slot_active` se define en
 * schema.sql y evita dos reservas activas en el mismo bloque.
 */
const appointmentModel = {
  /**
   * Inserta una cita. El índice único parcial garantiza que una carrera entre
   * dos reservas simultáneas falle con un error que capturamos arriba.
   */
  async create(data) {
    const { data: row, error } = await supabase
      .from('appointments')
      .insert({
        reference: data.reference,
        name: data.name,
        phone: data.phone,
        email: data.email,
        service: data.service,
        date: data.date,
        time: data.time,
        notes: data.notes,
        source_ip: data.source_ip,
        customer_id: data.customer_id || null,
      })
      .select('*')
      .single();
    if (error) throw error;
    return row;
  },

  async findById(id) {
    const { data, error } = await supabase
      .from('appointments')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  async findByReference(reference) {
    const { data, error } = await supabase
      .from('appointments')
      .select('*')
      .eq('reference', reference)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  /** Devuelve un Set con las horas "HH:MM" ya ocupadas en una fecha. */
  async takenTimes(dateStr) {
    const { data, error } = await supabase
      .from('appointments')
      .select('time')
      .eq('date', dateStr)
      .in('status', activeStatuses);
    if (error) throw error;
    return new Set((data || []).map((r) => r.time));
  },

  async slotIsTaken(dateStr, timeStr) {
    const { data, error } = await supabase
      .from('appointments')
      .select('id')
      .eq('date', dateStr)
      .eq('time', timeStr)
      .in('status', activeStatuses)
      .limit(1);
    if (error) throw error;
    return (data || []).length > 0;
  },

  async updateStatus(id, status) {
    const { data, error } = await supabase
      .from('appointments')
      .update({ status })
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return data;
  },

  /**
   * Listado para el panel admin, con filtros opcionales.
   * `q` busca en name/phone/email/reference con LIKE %x% (ilike en PG).
   */
  async list({ status, date, from, to, q, limit = 200, offset = 0 } = {}) {
    const pageSize = Math.min(Number(limit) || 200, 500);
    let query = supabase.from('appointments').select('*');
    if (status) query = query.eq('status', status);
    if (date) query = query.eq('date', date);
    if (from) query = query.gte('date', from);
    if (to) query = query.lte('date', to);
    if (q) {
      const like = `%${q}%`;
      query = query.or(
        `name.ilike.${like},phone.ilike.${like},email.ilike.${like},reference.ilike.${like}`,
      );
    }
    query = query
      .order('date', { ascending: true })
      .order('time', { ascending: true })
      .range(offset, offset + pageSize - 1);
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  /** Lista las citas de un cliente concreto (para "Mis citas"). */
  async listByCustomer(customerId) {
    const { data, error } = await supabase
      .from('appointments')
      .select('*')
      .eq('customer_id', customerId)
      .order('date', { ascending: true })
      .order('time', { ascending: true });
    if (error) throw error;
    return data || [];
  },

  /** Métricas rápidas para el dashboard. */
  async stats(todayStr) {
    const [total, pending, upcoming, today] = await Promise.all([
      supabase.from('appointments').select('id', { count: 'exact', head: true }),
      supabase
        .from('appointments')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending'),
      supabase
        .from('appointments')
        .select('id', { count: 'exact', head: true })
        .gte('date', todayStr)
        .in('status', activeStatuses),
      supabase
        .from('appointments')
        .select('id', { count: 'exact', head: true })
        .eq('date', todayStr)
        .in('status', activeStatuses),
    ]);
    for (const r of [total, pending, upcoming, today]) {
      if (r.error) throw r.error;
    }
    return {
      total: total.count || 0,
      pending: pending.count || 0,
      upcoming: upcoming.count || 0,
      today: today.count || 0,
    };
  },
};

/** ¿La fecha (YYYY-MM-DD) es un día laborable y no está bloqueada? */
function isWorkingDay(dateStr) {
  if (blackoutDates.includes(dateStr)) return false;
  const weekday = time.businessWeekday(dateStr);
  return Boolean(schedule[weekday]);
}

/**
 * Genera TODOS los bloques teóricos de un día laborable, según su horario.
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
      'DATE_HORIZON',
    );
  }
  if (!isWorkingDay(dateStr)) {
    throw new DomainError('Ese día no hay atención.', 'DATE_CLOSED');
  }
}

/** Valida que un bloque concreto (date, time) sea reservable. */
async function assertSlotBookable(dateStr, timeStr) {
  assertDateBookable(dateStr);
  if (!/^\d{2}:\d{2}$/.test(timeStr)) {
    throw new DomainError('Hora con formato inválido.', 'TIME_FORMAT');
  }
  const validSlots = new Set(allSlotsForDate(dateStr));
  if (!validSlots.has(timeStr)) {
    throw new DomainError('Ese horario no está disponible en el calendario.', 'TIME_INVALID');
  }
  if (time.hoursUntil(dateStr, timeStr) < minLeadTimeHours) {
    throw new DomainError(
      'La reserva debe hacerse con al menos 2 horas de anticipación.',
      'LEAD_TIME',
    );
  }
  if (await appointmentModel.slotIsTaken(dateStr, timeStr)) {
    throw new DomainError('Ese horario ya está reservado.', 'SLOT_TAKEN');
  }
}

/**
 * Devuelve la disponibilidad de un día: cada bloque con su estado.
 */
async function getAvailability(dateStr) {
  assertDateBookable(dateStr);

  const taken = await appointmentModel.takenTimes(dateStr);

  const slots = allSlotsForDate(dateStr).map((slot) => {
    const isTaken = taken.has(slot);
    const leadOk = time.hoursUntil(dateStr, slot) >= minLeadTimeHours;
    return { time: slot, available: !isTaken && leadOk };
  });

  return { date: dateStr, slots };
}

const availability = { isWorkingDay, allSlotsForDate, assertDateBookable, assertSlotBookable, getAvailability };

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

const booking = { createBooking, generateReference };

/** Disponibilidad de una fecha concreta (?date=YYYY-MM-DD). */
const getAvailabilityController = asyncHandler(async (req, res) => {
  const data = await availability.getAvailability(req.query.date);
  res.json({ ok: true, data });
});

/** Crea una reserva. Si el cliente está autenticado, se asocia a su cuenta. */
const createBookingController = asyncHandler(async (req, res) => {
  const { appointment, notifications } = await booking.createBooking(req.body, {
    ip: req.ip,
    customerId: req.customer ? req.customer.id : null,
  });

  // Se devuelve solo lo necesario al cliente (no el id interno ni la IP).
  res.status(201).json({
    ok: true,
    data: {
      reference: appointment.reference,
      name: appointment.name,
      service: appointment.service,
      serviceLabel: serviceLabel(appointment.service),
      date: appointment.date,
      time: appointment.time,
      status: appointment.status,
      notifications,
    },
  });
});

const router = express.Router();

/**
 * Si el cliente está logueado (cookie sb_customer_session), lo adjuntamos
 * en req.customer. Si no, sigue siendo un guest. Esto permite que la cita
 * se asocie a la cuenta cuando el cliente decide crearla justo después.
 */
router.post(
  '/bookings',
  customerSession.optional,
  csrfProtection,
  bookingLimiter,
  bookingRules,
  createBookingController,
);

router.get('/availability', availabilityRules, getAvailabilityController);

module.exports = { router, appointmentModel, availability, booking };
