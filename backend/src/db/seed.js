'use strict';

/**
 * Crea el usuario administrador inicial a partir de ADMIN_USERNAME /
 * ADMIN_PASSWORD del archivo .env. Idempotente: si el usuario ya existe, no
 * hace nada (no pisa la contraseña que Wendy pudiera haber cambiado luego).
 *
 * Uso:  npm run seed
 */

const bcrypt = require('bcryptjs');
const config = require('../config');
const { adminModel } = require('../domain/auth');
const migrate = require('./migrate');
const logger = require('../lib/logger');

const BCRYPT_ROUNDS = 12;

async function seed() {
  await migrate(); // asegura que las tablas existan

  const { username, password } = config.admin;

  if (!username || !password || password.startsWith('CAMBIA')) {
    logger.error(
      'No se puede crear el admin: define ADMIN_USERNAME y ADMIN_PASSWORD en .env.',
    );
    process.exit(1);
  }

  const existing = await adminModel.findByUsername(username);
  if (existing) {
    logger.info(`El administrador "${username}" ya existe; no se modifica.`);
    return;
  }

  const passwordHash = bcrypt.hashSync(password, BCRYPT_ROUNDS);
  await adminModel.create({ username, passwordHash });
  logger.info(`Administrador "${username}" creado correctamente.`);
  logger.warn('Por seguridad, borra ADMIN_PASSWORD del .env una vez creado el usuario.');
}

if (require.main === module) {
  seed()
    .then(() => process.exit(0))
    .catch((err) => {
      logger.error('Error en el seed:', err.message || err);
      process.exit(1);
    });
}

module.exports = seed;
