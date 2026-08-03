'use strict';

const fs = require('fs');
const Database = require('better-sqlite3');
const config = require('../config');
const logger = require('../lib/logger');

// Garantiza que exista la carpeta de datos antes de abrir el archivo.
fs.mkdirSync(config.paths.dataDir, { recursive: true });

const db = new Database(config.paths.dbFile);

// Ajustes recomendados para fiabilidad y concurrencia:
// - WAL: lecturas concurrentes con escrituras, menos bloqueos.
// - foreign_keys: integridad referencial activada (off por defecto en SQLite).
// - busy_timeout: reintenta en vez de fallar si la BD está momentáneamente ocupada.
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

logger.info(`Base de datos SQLite abierta en ${config.paths.dbFile}`);

module.exports = db;
