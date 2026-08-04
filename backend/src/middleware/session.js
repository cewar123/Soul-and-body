'use strict';

const jwt = require('jsonwebtoken');
const config = require('../config');

/**
 * Construye un par (issueSession, clearSession, requireSession) parametrizado
 * por nombre de cookie y selector de payload. Mantiene una sola implementación
 * de la lógica de sesión para admin y customer.
 */

function buildSession({ cookieName, ttl, getPayload, getEntity }) {
  function cookieOptions() {
    return {
      httpOnly: true,           // inaccesible desde JS (mitiga robo por XSS)
      sameSite: 'strict',       // no se envía cross-site (mitiga CSRF)
      secure: config.isProd,    // solo HTTPS en producción
      path: '/',
      maxAge: ttl,
    };
  }

  function issue(res, source) {
    const payload = getPayload(source);
    const token = jwt.sign(payload, config.security.jwtSecret, {
      expiresIn: typeof ttl === 'number' ? `${ttl}ms` : ttl,
    });
    res.cookie(cookieName, token, cookieOptions());
    return token;
  }

  function clear(res) {
    res.clearCookie(cookieName, { ...cookieOptions(), maxAge: undefined });
  }

  function readToken(req) {
    const token = req.cookies ? req.cookies[cookieName] : null;
    if (!token) return null;
    try {
      return jwt.verify(token, config.security.jwtSecret);
    } catch {
      // Token inválido o expirado. NO limpiamos aquí: el caller decide.
      return null;
    }
  }

  function require(req, res, next) {
    const payload = readToken(req);
    if (!payload) {
      return res.status(401).json({ ok: false, error: 'No autenticado.', code: 'NO_SESSION' });
    }
    const entity = getEntity ? getEntity(payload) : payload;
    req[entity.reqKey] = entity.value;
    return next();
  }

  /** Adjunta la entidad si hay sesión válida; nunca falla. */
  function optional(req, _res, next) {
    const payload = readToken(req);
    if (payload) {
      const entity = getEntity ? getEntity(payload) : payload;
      req[entity.reqKey] = entity.value;
    }
    return next();
  }

  return { issue, clear, require, optional };
}

module.exports = buildSession;
