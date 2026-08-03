'use strict';

const config = require('./config');
const migrate = require('./db/migrate');
const logger = require('./lib/logger');

// Asegura que el esquema exista ANTES de cargar la app (los modelos
// preparan sentencias al cargarse, así que la tabla debe existir primero).
migrate();

const app = require('./app');

const server = app.listen(config.port, () => {
  logger.info(`Soul and Body escuchando en ${config.publicUrl} (puerto ${config.port})`);
  logger.info(`Panel de administración: ${config.publicUrl}/admin`);
});

// --- Apagado ordenado -------------------------------------------------------
function shutdown(signal) {
  logger.info(`Recibido ${signal}. Cerrando servidor...`);
  server.close(() => {
    logger.info('Servidor cerrado. Hasta luego.');
    process.exit(0);
  });
  // Si algo se queda colgado, forzar salida a los 10s.
  setTimeout(() => process.exit(1), 10000).unref();
}

['SIGINT', 'SIGTERM'].forEach((sig) => process.on(sig, () => shutdown(sig)));

process.on('unhandledRejection', (reason) => {
  logger.error('Rechazo de promesa no gestionado:', reason);
});
process.on('uncaughtException', (err) => {
  logger.error('Excepción no capturada:', err);
  process.exit(1);
});

module.exports = server;
