'use strict';

const express = require('express');
const asyncHandler = require('../lib/asyncHandler');
const { serviceLabel } = require('../lib/format');
const time = require('../lib/time');
const { HttpError } = require('../lib/errors');
const { require: requireAdmin } = require('../middleware/auth');
const { statusRules, listRules } = require('../middleware/validate');
const { csrfProtection } = require('../middleware/csrf');
const { appointmentModel } = require('./booking');

/** Añade la etiqueta legible del servicio a una fila de cita. */
function decorate(appt) {
  return { ...appt, serviceLabel: serviceLabel(appt.service) };
}

/** Listado de citas con filtros (?status=&date=&from=&to=&q=). */
const list = asyncHandler(async (req, res) => {
  const rows = await appointmentModel.list(req.query);
  const decorated = rows.map(decorate);
  res.json({ ok: true, data: decorated, count: decorated.length });
});

/** Métricas para el dashboard. */
const stats = asyncHandler(async (req, res) => {
  const today = time.getBusinessNowParts().dateStr;
  const data = await appointmentModel.stats(today);
  res.json({ ok: true, data });
});

/** Detalle de una cita por id. */
const getOne = asyncHandler(async (req, res) => {
  const appt = await appointmentModel.findById(Number(req.params.id));
  if (!appt) throw new HttpError(404, 'Cita no encontrada.', 'NOT_FOUND');
  res.json({ ok: true, data: decorate(appt) });
});

/** Cambia el estado de una cita (confirmar, cancelar, completar). */
const updateStatus = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const { status } = req.body;

  const appt = await appointmentModel.findById(id);
  if (!appt) throw new HttpError(404, 'Cita no encontrada.', 'NOT_FOUND');

  await appointmentModel.updateStatus(id, status);
  const updated = await appointmentModel.findById(id);
  res.json({ ok: true, data: decorate(updated) });
});

const router = express.Router();

// Todas las rutas de este router exigen sesión de administrador válida.
router.use(requireAdmin);

router.get('/stats', stats);
router.get('/appointments', listRules, list);
router.get('/appointments/:id', getOne);
router.patch('/appointments/:id/status', csrfProtection, statusRules, updateStatus);

module.exports = { router };
