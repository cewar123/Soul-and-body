'use strict';

const { body } = require('express-validator');

/** Reglas de validación para clientes. Se aplica junto a `handleValidation`. */
const stripControl = (v) =>
  typeof v === 'string' ? v.replace(/[\x00-\x1F\x7F]/g, '').trim() : v;

const NAME_RE = /^[\p{L}\p{M}][\p{L}\p{M} .'’-]*$/u;
const PHONE_RE = /^\+?\d{7,15}$/;

const registerRules = [
  body('name')
    .customSanitizer(stripControl)
    .isLength({ min: 2, max: 80 }).withMessage('El nombre debe tener entre 2 y 80 caracteres.')
    .matches(NAME_RE).withMessage('El nombre contiene caracteres no válidos.'),
  body('email')
    .isEmail().withMessage('Correo inválido.')
    .normalizeEmail(),
  body('phone')
    .optional({ nullable: true, checkFalsy: true })
    .customSanitizer((v) => (typeof v === 'string' ? v.replace(/[^\d+]/g, '') : v))
    .matches(PHONE_RE).withMessage('Teléfono inválido (7 a 15 dígitos).'),
  body('password')
    .isLength({ min: 8, max: 200 }).withMessage('La contraseña debe tener al menos 8 caracteres.'),
  body('passwordConfirm')
    .custom((value, { req }) => value === req.body.password).withMessage('Las contraseñas no coinciden.'),
];

const loginRules = [
  body('email').isEmail().withMessage('Correo inválido.').normalizeEmail(),
  body('password').isString().isLength({ min: 1 }).withMessage('Contraseña requerida.'),
];

const profileUpdateRules = [
  body('name')
    .optional()
    .customSanitizer(stripControl)
    .isLength({ min: 2, max: 80 }).withMessage('El nombre debe tener entre 2 y 80 caracteres.')
    .matches(NAME_RE).withMessage('El nombre contiene caracteres no válidos.'),
  body('phone')
    .optional()
    .customSanitizer((v) => (typeof v === 'string' ? v.replace(/[^\d+]/g, '') : v))
    .matches(PHONE_RE).withMessage('Teléfono inválido (7 a 15 dígitos).'),
];

const passwordChangeRules = [
  body('currentPassword').isString().isLength({ min: 1 }).withMessage('Falta la contraseña actual.'),
  body('newPassword').isLength({ min: 8, max: 200 }).withMessage('La nueva contraseña debe tener al menos 8 caracteres.'),
  body('newPasswordConfirm')
    .custom((value, { req }) => value === req.body.newPassword).withMessage('Las contraseñas no coinciden.'),
];

module.exports = { registerRules, loginRules, profileUpdateRules, passwordChangeRules };
