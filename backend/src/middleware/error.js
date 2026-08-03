'use strict';

const logger = require('../lib/logger');

/** 404 para rutas de API no encontradas. */
function notFound(req, res) {
  res.status(404).json({ ok: false, error: 'Recurso no encontrado.', code: 'NOT_FOUND' });
}

/**
 * Manejador de errores central. Traduce errores de dominio a 400 con mensaje
 * útil y oculta los detalles de los errores inesperados (no filtra stack ni
 * información sensible al cliente), registrándolos en el servidor.
 */
function errorHandler(err, _req, res, _next) {
  // Errores de negocio esperados: mensaje claro para el usuario.
  if (err && (err.name === 'DomainError' || err.status === 400)) {
    return res.status(400).json({ ok: false, error: err.message, code: err.code || 'INVALID' });
  }

  // Errores HTTP explícitos (404, 401, 403, 409, 422...).
  if (err && err.name === 'HttpError' && err.status) {
    return res.status(err.status).json({ ok: false, error: err.message, code: err.code || 'HTTP' });
  }

  // JSON malformado en el cuerpo de la petición.
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ ok: false, error: 'Cuerpo de la solicitud inválido.', code: 'BAD_JSON' });
  }

  // Cualquier otra cosa: error interno, sin filtrar detalles.
  logger.error('Error no controlado:', err && err.stack ? err.stack : err);
  return res.status(500).json({ ok: false, error: 'Ocurrió un error inesperado. Inténtalo más tarde.', code: 'INTERNAL' });
}

module.exports = { notFound, errorHandler };
