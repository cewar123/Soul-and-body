'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const supabase = require('../db/connection');
const asyncHandler = require('../lib/asyncHandler');
const {
  require: requireAdmin,
  issue: issueSession,
  clear: clearSession,
} = require('../middleware/auth');
const { loginRules, passwordChangeRules } = require('../middleware/validate');
const { loginLimiter } = require('../middleware/rateLimit');
const { csrfProtection } = require('../middleware/csrf');

/**
 * Acceso a la tabla `admins` sobre Supabase.
 */
const adminModel = {
  async findByUsername(username) {
    const { data, error } = await supabase
      .from('admins')
      .select('*')
      .eq('username', username)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  async findById(id) {
    const { data, error } = await supabase
      .from('admins')
      .select('id, username, created_at')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  async create({ username, passwordHash }) {
    const { error } = await supabase
      .from('admins')
      .insert({ username, password_hash: passwordHash });
    if (error) throw error;
  },

  async updatePassword({ id, passwordHash }) {
    const { error } = await supabase
      .from('admins')
      .update({ password_hash: passwordHash })
      .eq('id', id);
    if (error) throw error;
  },

  async count() {
    const { count, error } = await supabase
      .from('admins')
      .select('id', { count: 'exact', head: true });
    if (error) throw error;
    return count || 0;
  },
};

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

const router = express.Router();

router.post('/login', csrfProtection, loginLimiter, loginRules, login);
router.post('/logout', csrfProtection, logout);
router.get('/me', requireAdmin, me);
router.post('/change-password', csrfProtection, requireAdmin, passwordChangeRules, changePassword);

module.exports = { router, adminModel };
