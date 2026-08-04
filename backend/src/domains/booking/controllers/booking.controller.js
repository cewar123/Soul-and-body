'use strict';

const asyncHandler = require('../../../lib/asyncHandler');
const { serviceLabel } = require('../../../lib/format');
const availability = require('../services/availability.service');
const booking = require('../services/booking.service');

/** Disponibilidad de una fecha concreta (?date=YYYY-MM-DD). */
const getAvailability = asyncHandler(async (req, res) => {
  const data = await availability.getAvailability(req.query.date);
  res.json({ ok: true, data });
});

/** Crea una reserva. */
const createBooking = asyncHandler(async (req, res) => {
  const { appointment, notifications } = await booking.createBooking(req.body, {
    ip: req.ip,
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

module.exports = { getAvailability, createBooking };
