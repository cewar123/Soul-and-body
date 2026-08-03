'use strict';

const rateLimit = require('express-rate-limit');
const asyncHandler = require('../../../lib/asyncHandler');
const customerModel = require('../customer.model');
const session = require('../customer.auth');
const { handleValidation } = require('../../../middleware/validate');
const { DomainError } = require('../../../lib/errors');
const { registerRules, loginRules, profileUpdateRules, passwordChangeRules } = require('../customer.schema');

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

    if (customerModel.findByEmail(lowerEmail)) {
      throw new DomainError('Ya existe una cuenta con ese email.', 'EMAIL_EXISTS');
    }

    const customer = customerModel.create({
      email: lowerEmail,
      password,
      name: name.trim(),
      phone: phone?.trim() || null,
    });

    session.issue(res, customer);
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
    const customer = customerModel.findByEmail(email.toLowerCase());
    if (!customer || !customerModel.verifyPassword(customer, password)) {
      // Mismo error genérico para no revelar si el email existe.
      throw new DomainError('Credenciales inválidas.', 'BAD_CREDENTIALS');
    }

    session.issue(res, customer);
    res.json({ ok: true, data: { id: customer.id, email: customer.email, name: customer.name } });
  }),
];

/** Logout. */
const logout = (req, res) => {
  session.clear(res);
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

    customerModel.updateProfile({
      id: req.customer.id,
      name: name.trim(),
      phone: phone?.trim() || null,
    });
    const updated = customerModel.findById(req.customer.id);
    res.json({ ok: true, data: updated });
  }),
];

/** Cambiar contraseña. */
const changePassword = [
  ...passwordChangeRules,
  handleValidation,
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body;

    const customer = customerModel.findById(req.customer.id);
    if (!customer || !customerModel.verifyPassword(customer, currentPassword)) {
      throw new DomainError('La contraseña actual no es correcta.', 'BAD_CREDENTIALS');
    }

    customerModel.updatePassword({ id: req.customer.id, password: newPassword });
    res.json({ ok: true });
  }),
];

module.exports = {
  register,
  login,
  logout,
  me,
  updateProfile,
  changePassword,
  authLimiter,
};
