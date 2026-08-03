'use strict';

/**
 * Aplica el esquema de base de datos (idempotente: se puede correr varias veces).
 * Uso:  npm run migrate
 */

const fs = require('fs');
const path = require('path');
const db = require('./connection');
const logger = require('../lib/logger');

const schemaPath = path.resolve(__dirname, '../../../database/schema.sql');

function migrate() {
  const sql = fs.readFileSync(schemaPath, 'utf8');
  db.exec(sql);
  logger.info('Migración aplicada correctamente (esquema al día).');
}

// Permite ejecutarlo por CLI o importarlo desde el arranque del servidor.
if (require.main === module) {
  try {
    migrate();
    process.exit(0);
  } catch (err) {
    logger.error('Error aplicando la migración:', err.message);
    process.exit(1);
  }
}

module.exports = migrate;
