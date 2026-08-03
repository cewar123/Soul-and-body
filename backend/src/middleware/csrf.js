'use strict';

const crypto = require('crypto');
const config = require('../config');

/**
 * Protección CSRF por "double-submit cookie".
 *
 * Flujo:
 *  1. El frontend pide GET /api/csrf-token. Guardamos un token aleatorio en una
 *     cookie httpOnly + SameSite=Strict y devolvemos el MISMO token en el cuerpo.
 *  2. En cada petición que modifica estado (POST/PUT/PATCH/DELETE) el frontend
 *     reenvía el token en la cabecera `x-csrf-token`.
 *  3. Aquí comparamos cabecera vs. cookie de forma timing-safe.
 *
 * Un atacante en otro origen no puede leer la cookie (SOP) ni el cuerpo de la
 * respuesta (CORS), por lo que no puede falsificar una cabecera que coincida.
 * SameSite=Strict añade una segunda barrera.
 */

const COOKIE_NAME = 'sb_csrf';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure: config.isProd,
    path: '/',
    maxAge: 1000 * 60 * 60 * 8, // 8 horas
  };
}

/** Genera un token, lo fija como cookie y lo devuelve para enviar al cliente. */
function issueToken(res) {
  const token = crypto.randomBytes(32).toString('hex');
  res.cookie(COOKIE_NAME, token, cookieOptions());
  return token;
}

function timingSafeEqual(a = '', b = '') {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/** Middleware que exige un token CSRF válido en métodos que modifican estado. */
function csrfProtection(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();

  const cookieToken = req.cookies ? req.cookies[COOKIE_NAME] : null;
  const headerToken = req.get('x-csrf-token');

  if (!cookieToken || !headerToken || !timingSafeEqual(cookieToken, headerToken)) {
    return res.status(403).json({
      ok: false,
      error: 'Token CSRF inválido o ausente. Recarga la página e inténtalo de nuevo.',
      code: 'CSRF',
    });
  }
  return next();
}

module.exports = { issueToken, csrfProtection, COOKIE_NAME };
