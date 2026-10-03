'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { body } = require('express-validator');
const supabase = require('../db/connection');
const asyncHandler = require('../lib/asyncHandler');
const customerSession = require('../middleware/customerSession');
const { csrfProtection } = require('../middleware/csrf');
const { handleValidation } = require('../middleware/validate');
const { serviceLabel } = require('../lib/format');
const { HttpError, DomainError } = require('../lib/errors');
const { appointmentModel } = require('./booking');

/**
 * Acceso a la tabla `customers` sobre Supabase.
 */
const customerModel = {
  BCRYPT_ROUNDS: 12,

  async create({ email, password, name, phone }) {
    const password_hash = bcrypt.hashSync(password, this.BCRYPT_ROUNDS);
    const { data, error } = await supabase
      .from('customers')
      .insert({ email, password_hash, name, phone })
      .select('id, email, name, phone, created_at')
      .single();
    if (error) throw error;
    return data;
  },

  async findByEmail(email) {
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .eq('email', email)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  async findById(id) {
    const { data, error } = await supabase
      .from('customers')
      .select('id, email, name, phone, created_at')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  verifyPassword(customer, password) {
    return bcrypt.compareSync(password, customer.password_hash);
  },

  async updateProfile({ id, name, phone }) {
    const { error } = await supabase
      .from('customers')
      .update({ name, phone })
      .eq('id', id);
    if (error) throw error;
  },

  async updatePassword({ id, password }) {
    const password_hash = bcrypt.hashSync(password, this.BCRYPT_ROUNDS);
    const { error } = await supabase
      .from('customers')
      .update({ password_hash })
      .eq('id', id);
    if (error) throw error;
  },
};

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

/** Límite estricto para registro/login de clientes. */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) =>
    res.status(429).json({ ok: false, error: 'Demasiados intentos. Espera un momento.', code: 'RATE_LIMIT' }),
});

/** Registro de nuevo cliente. */
const register = [
  ...registerRules,
  handleValidation,
  asyncHandler(async (req, res) => {
    const { email, password, name, phone } = req.body;
    const lowerEmail = email.toLowerCase();

    if (await customerModel.findByEmail(lowerEmail)) {
      throw new DomainError('Ya existe una cuenta con ese email.', 'EMAIL_EXISTS');
    }

    const customer = await customerModel.create({
      email: lowerEmail,
      password,
      name: name.trim(),
      phone: phone?.trim() || null,
    });

    customerSession.issue(res, customer);
    res.status(201).json({
      ok: true,
      data: { id: customer.id, email: customer.email, name: customer.name },
    });
  }),
];

/** Login de cliente. */
const login = [
  ...loginRules,
  handleValidation,
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const customer = await customerModel.findByEmail(email.toLowerCase());
    if (!customer || !customerModel.verifyPassword(customer, password)) {
      // Mismo error genérico para no revelar si el email existe.
      throw new DomainError('Credenciales inválidas.', 'BAD_CREDENTIALS');
    }

    customerSession.issue(res, customer);
    res.json({ ok: true, data: { id: customer.id, email: customer.email, name: customer.name } });
  }),
];

/** Logout. */
const logout = (req, res) => {
  customerSession.clear(res);
  res.json({ ok: true });
};

/** Cliente autenticado. */
const me = (req, res) => {
  res.json({ ok: true, data: { id: req.customer.id, email: req.customer.email, name: req.customer.name } });
};

/** Actualizar perfil. */
const updateProfile = [
  ...profileUpdateRules,
  handleValidation,
  asyncHandler(async (req, res) => {
    const { name, phone } = req.body;
    if (!name) throw new DomainError('El nombre es obligatorio.', 'VALIDATION');

    await customerModel.updateProfile({
      id: req.customer.id,
      name: name.trim(),
      phone: phone?.trim() || null,
    });
    const updated = await customerModel.findById(req.customer.id);
    res.json({ ok: true, data: updated });
  }),
];

/** Cambiar contraseña. */
const changePassword = [
  ...passwordChangeRules,
  handleValidation,
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body;

    const customer = await customerModel.findById(req.customer.id);
    if (!customer || !customerModel.verifyPassword(customer, currentPassword)) {
      throw new DomainError('La contraseña actual no es correcta.', 'BAD_CREDENTIALS');
    }

    await customerModel.updatePassword({ id: req.customer.id, password: newPassword });
    res.json({ ok: true });
  }),
];

const router = express.Router();

// Rutas públicas con rate limiting.
router.post('/register', authLimiter, register);
router.post('/login', authLimiter, login);

// Rutas protegidas (requieren sesión de cliente).
router.post('/logout', customerSession.require, logout);
router.get('/me', customerSession.require, me);
router.patch('/profile', customerSession.require, csrfProtection, updateProfile);
router.post('/change-password', customerSession.require, csrfProtection, changePassword);

/**
 * "Mis citas": lista de las citas asociadas a la cuenta actual.
 * Decoramos con serviceLabel para que la UI pinte el nombre humano del servicio.
 */
router.get('/appointments', customerSession.require, asyncHandler(async (req, res) => {
  const rows = await appointmentModel.listByCustomer(req.customer.id);
  const decorated = rows.map((a) => ({ ...a, serviceLabel: serviceLabel(a.service) }));
  res.json({ ok: true, data: decorated, count: decorated.length });
}));

/**
 * Cancelar una de mis citas. Solo permitido si la cita pertenece al cliente
 * actual y aún está en estado "pending" o "confirmed".
 */
router.post(
  '/appointments/:id/cancel',
  customerSession.require,
  csrfProtection,
  asyncHandler(async (req, res) => {
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
  }),
);

module.exports = { router };
