'use strict';

const { body, param, query, validationResult } = require('express-validator');
const config = require('../config');

const serviceIds = config.business.services.map((s) => s.id);
const statuses = config.business.statuses;

/**
 * Ejecuta las reglas de validación y corta con 422 si algo falla, devolviendo
 * mensajes claros y sin filtrar detalles internos.
 */
function handleValidation(req, res, next) {
  const errors = validationResult(req);
  if (errors.isEmpty()) return next();
  return res.status(422).json({
    ok: false,
    error: 'Revisa los datos del formulario.',
    code: 'VALIDATION',
    fields: errors.array().map((e) => ({ field: e.path, message: e.msg })),
  });
}

// Quita caracteres de control y recorta; no transforma a entidades HTML para
// mantener los datos legibles (el escape se hace SIEMPRE en cada salida).
const CONTROL_CHARS = /[\x00-\x1F\x7F]/g;
const stripControl = (v) =>
  typeof v === 'string' ? v.replace(CONTROL_CHARS, '').trim() : v;

/** Reglas para crear una reserva desde el formulario público. */
const bookingRules = [
  // Honeypot anti-bot: campo oculto que un humano deja vacío.
  body('website').optional({ nullable: true }).isEmpty().withMessage('spam'),

  body('name')
    .customSanitizer(stripControl)
    .isLength({ min: 2, max: 80 }).withMessage('El nombre debe tener entre 2 y 80 caracteres.')
    .matches(/^[\p{L}\p{M}][\p{L}\p{M} .'’-]*$/u).withMessage('El nombre contiene caracteres no válidos.'),

  body('phone')
    .customSanitizer((v) => (typeof v === 'string' ? v.replace(/[^\d+]/g, '') : v))
    .matches(/^\+?\d{7,15}$/).withMessage('Teléfono inválido (7 a 15 dígitos).'),

  body('email')
    .optional({ nullable: true, checkFalsy: true })
    .isEmail().withMessage('Correo inválido.')
    .isLength({ max: 120 }).withMessage('Correo demasiado largo.')
    .normalizeEmail(),

  body('service')
    .isIn(serviceIds).withMessage('Servicio no válido.'),

  body('date')
    .matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('Fecha inválida.'),

  body('time')
    .matches(/^\d{2}:\d{2}$/).withMessage('Hora inválida.'),

  body('notes')
    .optional({ nullable: true, checkFalsy: true })
    .customSanitizer(stripControl)
    .isLength({ max: 500 }).withMessage('Las notas no pueden superar 500 caracteres.')
    .customSanitizer((v) => (typeof v === 'string' ? v.replace(/[<>]/g, '') : v)),

  handleValidation,
];

/** Reglas para el login del administrador. */
const loginRules = [
  body('username').isString().trim().isLength({ min: 3, max: 40 }).withMessage('Usuario inválido.'),
  body('password').isString().isLength({ min: 6, max: 200 }).withMessage('Contraseña inválida.'),
  handleValidation,
];

/** Reglas para cambiar el estado de una cita. */
const statusRules = [
  param('id').isInt({ min: 1 }).withMessage('Id inválido.'),
  body('status').isIn(statuses).withMessage('Estado no válido.'),
  handleValidation,
];

/** Reglas para cambiar la contraseña del admin. */
const passwordChangeRules = [
  body('currentPassword').isString().isLength({ min: 1 }).withMessage('Falta la contraseña actual.'),
  body('newPassword').isString().isLength({ min: 8, max: 200 }).withMessage('La nueva contraseña debe tener al menos 8 caracteres.'),
  handleValidation,
];

/** Reglas para consultar disponibilidad. */
const availabilityRules = [
  query('date').matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('Fecha inválida.'),
  handleValidation,
];

/** Reglas para el listado del panel (todos opcionales). */
const listRules = [
  query('status').optional().isIn(statuses).withMessage('Estado no válido.'),
  query('date').optional().matches(/^\d{4}-\d{2}-\d{2}$/),
  query('from').optional().matches(/^\d{4}-\d{2}-\d{2}$/),
  query('to').optional().matches(/^\d{4}-\d{2}-\d{2}$/),
  query('q').optional().customSanitizer(stripControl).isLength({ max: 60 }),
  handleValidation,
];

module.exports = {
  handleValidation,
  bookingRules,
  loginRules,
  statusRules,
  passwordChangeRules,
  availabilityRules,
  listRules,
};
