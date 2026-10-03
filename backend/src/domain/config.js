'use strict';

const express = require('express');
const config = require('../config');
const { issueToken } = require('../middleware/csrf');

/** Datos públicos que el frontend necesita para pintar el formulario. */
function getConfig(req, res) {
  const { brand, services, slotMinutes, schedule } = config.business;
  res.json({
    ok: true,
    data: {
      brand,
      services,
      slotMinutes,
      timezone: config.business.timezone,
      whatsapp: config.business.whatsapp,
      // Días abiertos (para deshabilitar días cerrados en el selector).
      openWeekdays: Object.entries(schedule)
        .filter(([, v]) => v)
        .map(([k]) => Number(k)),
      horizonDays: config.business.bookingHorizonDays,
    },
  });
}

/** Emite un token CSRF y lo devuelve al cliente. */
function getCsrfToken(req, res) {
  const token = issueToken(res);
  res.json({ ok: true, csrfToken: token });
}

const router = express.Router();

router.get('/config', getConfig);
router.get('/csrf-token', getCsrfToken);

module.exports = { router };
