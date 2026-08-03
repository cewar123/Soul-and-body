'use strict';

/**
 * Helpers de respuesta HTTP estandarizados.
 * Mantienen la forma `{ ok, data, error, code, ... }` en todo el API.
 */

function ok(res, data = null, status = 200) {
  return res.status(status).json({ ok: true, ...(data !== null ? { data } : {}) });
}

function fail(res, status, error, code = 'ERROR') {
  return res.status(status).json({ ok: false, error, code });
}

module.exports = { ok, fail };
