'use strict';

const asyncHandler = require('../../../lib/asyncHandler');
const appointmentModel = require('../../booking/models/appointment.model');
const { serviceLabel } = require('../../../lib/format');
const time = require('../../../lib/time');
const { HttpError } = require('../../../lib/errors');

/** Añade la etiqueta legible del servicio a una fila de cita. */
function decorate(appt) {
  return { ...appt, serviceLabel: serviceLabel(appt.service) };
}

/** Listado de citas con filtros (?status=&date=&from=&to=&q=). */
const list = asyncHandler(async (req, res) => {
  const rows = appointmentModel.list(req.query).map(decorate);
  res.json({ ok: true, data: rows, count: rows.length });
});

/** Métricas para el dashboard. */
const stats = asyncHandler(async (req, res) => {
  const today = time.getBusinessNowParts().dateStr;
  res.json({ ok: true, data: appointmentModel.stats(today) });
});

/** Detalle de una cita por id. */
const getOne = asyncHandler(async (req, res) => {
  const appt = appointmentModel.findById(Number(req.params.id));
  if (!appt) throw new HttpError(404, 'Cita no encontrada.', 'NOT_FOUND');
  res.json({ ok: true, data: decorate(appt) });
});

/** Cambia el estado de una cita (confirmar, cancelar, completar). */
const updateStatus = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const { status } = req.body;

  const appt = appointmentModel.findById(id);
  if (!appt) throw new HttpError(404, 'Cita no encontrada.', 'NOT_FOUND');

  appointmentModel.updateStatus(id, status);
  res.json({ ok: true, data: decorate(appointmentModel.findById(id)) });
});

module.exports = { list, stats, getOne, updateStatus };
