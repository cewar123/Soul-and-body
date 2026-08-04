'use strict';

/**
 * Helpers para tests:
 * - `withFreshApp(fn)` ejecuta la suite con la app de Express en proceso.
 * - Si SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY están configuradas, los tests
 *   tocan la BD real (idealmente un proyecto de Supabase separado).
 * - Si no, los tests que necesitan BD se saltan con `t.skip` para que
 *   `npm test` siga siendo ejecutable en CI sin credenciales.
 */

const request = require('supertest');
const { test } = require('node:test');

function hasSupabase() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

async function loadApp() {
  // Re-cargar la app con el env actual (test ya establece las variables).
  for (const key of Object.keys(require.cache)) {
    if (
      key.includes(`${require('path').sep}backend${require('path').sep}src${require('path').sep}`)
    ) {
      delete require.cache[key];
    }
  }
  return require('../src/app');
}

async function withFreshApp(t, fn) {
  if (!hasSupabase()) {
    t.skip('Tests de integración requieren SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.');
    return;
  }
  const app = await loadApp();
  await fn({ app, request });
}

module.exports = { withFreshApp, hasSupabase, test };
