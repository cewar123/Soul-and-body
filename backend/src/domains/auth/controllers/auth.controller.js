'use strict';

const bcrypt = require('bcryptjs');
const asyncHandler = require('../../../lib/asyncHandler');
const adminModel = require('../admin.model');
const { issue: issueSession, clear: clearSession } = require('../../../middleware/auth');

/**
 * Login del administrador. Respuestas genéricas ante credenciales incorrectas
 * (no revela si el usuario existe) y comparación con bcrypt (resistente a
 * fuerza bruta; el rate limiter añade otra capa).
 */
const login = asyncHandler(async (req, res) => {
  const { username, password } = req.body;
  const admin = await adminModel.findByUsername(username);

  // Se ejecuta bcrypt incluso si el usuario no existe, para no dar pistas por
  // diferencia de tiempo de respuesta (mitiga enumeración de usuarios).
  const hash = admin ? admin.password_hash : '$2a$12$0000000000000000000000000000000000000000000000';
  const valid = bcrypt.compareSync(password, hash);

  if (!admin || !valid) {
    return res.status(401).json({ ok: false, error: 'Usuario o contraseña incorrectos.', code: 'BAD_CREDENTIALS' });
  }

  issueSession(res, admin);
  return res.json({ ok: true, data: { username: admin.username } });
});

/** Cierra la sesión. */
const logout = (req, res) => {
  clearSession(res);
  res.json({ ok: true });
};

/** Devuelve el admin autenticado (para que el panel valide la sesión al cargar). */
const me = (req, res) => {
  res.json({ ok: true, data: { username: req.admin.username } });
};

/** Cambio de contraseña del propio administrador. */
const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const admin = await adminModel.findByUsername(req.admin.username);

  if (!admin || !bcrypt.compareSync(currentPassword, admin.password_hash)) {
    return res.status(401).json({ ok: false, error: 'La contraseña actual no es correcta.', code: 'BAD_CREDENTIALS' });
  }

  const passwordHash = bcrypt.hashSync(newPassword, 12);
  await adminModel.updatePassword({ id: admin.id, passwordHash });
  return res.json({ ok: true });
});

module.exports = { login, logout, me, changePassword };
