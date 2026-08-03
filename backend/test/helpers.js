'use strict';

/**
 * Helpers para tests:
 * - Crea una app de Express con un archivo de BD temporal.
 * - Usa supertest para llamadas HTTP en proceso (sin puerto real).
 * - `withFreshApp(fn)` ejecuta `fn(app, agent, config)` y limpia después.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

function isolateEnv() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-test-'));
  const dataDir = path.join(tmp, 'data');
  fs.mkdirSync(dataDir, { recursive: true });

  // Variables estables para esta suite de tests.
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'a'.repeat(64);
  process.env.CSRF_SECRET = 'b'.repeat(64);
  process.env.ADMIN_USERNAME = 'testadmin';
  process.env.ADMIN_PASSWORD = 'TestPass123!';
  process.env.BUSINESS_TZ = 'America/Bogota';
  process.env.BUSINESS_WHATSAPP = '573136147706';
  process.env.PUBLIC_URL = 'http://localhost';

  return { tmp, dataDir };
}

function clearRequireCache() {
  for (const key of Object.keys(require.cache)) {
    if (
      key.includes(`${path.sep}backend${path.sep}src${path.sep}`) ||
      key.includes(`${path.sep}backend${path.sep}test${path.sep}`)
    ) {
      delete require.cache[key];
    }
  }
}

function loadApp(dataDir) {
  clearRequireCache();
  const config = require('../src/config');
  config.paths.dataDir = dataDir;
  config.paths.dbFile = path.join(dataDir, 'test.db');

  // Crea la BD de cero.
  require('../src/db/migrate')();
  const app = require('../src/app');
  return { app, config };
}

function cleanup(tmp) {
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

async function withFreshApp(fn) {
  const { tmp, dataDir } = isolateEnv();
  try {
    const { app, config } = loadApp(dataDir);
    // supertest se aplica sobre la app directamente.
    const request = require('supertest');
    await fn({ app, request, config, dataDir });
  } finally {
    cleanup(tmp);
  }
}

module.exports = { withFreshApp, isolateEnv, loadApp, cleanup };
