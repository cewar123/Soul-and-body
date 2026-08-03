'use strict';

const rateLimit = require('express-rate-limit');

/** Respuesta uniforme cuando se supera un límite. */
function limitHandler(req, res) {
  res.status(429).json({
    ok: false,
    error: 'Demasiadas solicitudes. Espera un momento e inténtalo de nuevo.',
    code: 'RATE_LIMIT',
  });
}

const common = {
  standardHeaders: true,
  legacyHeaders: false,
  handler: limitHandler,
};

/** Límite general para toda la API (protección de fondo contra abuso/DoS). */
const apiLimiter = rateLimit({
  ...common,
  windowMs: 15 * 60 * 1000, // 15 min
  max: 300,
});

/** Límite estricto para crear reservas (evita spam de citas por bots). */
const bookingLimiter = rateLimit({
  ...common,
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 8, // hasta 8 reservas por IP/hora
});

/** Límite muy estricto para el login (evita fuerza bruta de contraseñas). */
const loginLimiter = rateLimit({
  ...common,
  windowMs: 15 * 60 * 1000, // 15 min
  max: 10, // 10 intentos por IP cada 15 min
});

module.exports = { apiLimiter, bookingLimiter, loginLimiter };
