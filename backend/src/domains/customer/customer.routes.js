'use strict';

const express = require('express');
const ctrl = require('./controllers/auth.controller');
const session = require('./customer.auth');
const appointmentModel = require('../booking/models/appointment.model');
const { serviceLabel } = require('../../lib/format');
const { HttpError } = require('../../lib/errors');
const { csrfProtection } = require('../../middleware/csrf');

const router = express.Router();

// Rutas públicas con rate limiting.
router.post('/register', ctrl.authLimiter, ctrl.register);
router.post('/login', ctrl.authLimiter, ctrl.login);

// Rutas protegidas (requieren sesión de cliente).
router.post('/logout', session.require, ctrl.logout);
router.get('/me', session.require, ctrl.me);
router.patch('/profile', session.require, csrfProtection, ctrl.updateProfile);
router.post('/change-password', session.require, csrfProtection, ctrl.changePassword);

/**
 * "Mis citas": lista de las citas asociadas a la cuenta actual.
 * Decoramos con serviceLabel para que la UI pinte el nombre humano del servicio.
 */
router.get('/appointments', session.require, async (req, res, next) => {
  try {
    const rows = await appointmentModel.listByCustomer(req.customer.id);
    const decorated = rows.map((a) => ({ ...a, serviceLabel: serviceLabel(a.service) }));
    res.json({ ok: true, data: decorated, count: decorated.length });
  } catch (err) {
    next(err);
  }
});

/**
 * Cancelar una de mis citas. Solo permitido si la cita pertenece al cliente
 * actual y aún está en estado "pending" o "confirmed".
 */
router.post('/appointments/:id/cancel', session.require, csrfProtection, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const appt = await appointmentModel.findById(id);
    if (!appt) throw new HttpError(404, 'Cita no encontrada.', 'NOT_FOUND');
    if (appt.customer_id !== req.customer.id) {
      throw new HttpError(403, 'No tienes permiso sobre esta cita.', 'FORBIDDEN');
    }
    if (!['pending', 'confirmed'].includes(appt.status)) {
      throw new HttpError(409, 'Solo puedes cancelar citas pendientes o confirmadas.', 'BAD_STATE');
    }
    await appointmentModel.updateStatus(id, 'cancelled');
    const updated = await appointmentModel.findById(id);
    res.json({ ok: true, data: { ...updated, serviceLabel: serviceLabel(updated.service) } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
