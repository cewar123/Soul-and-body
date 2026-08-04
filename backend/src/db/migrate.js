'use strict';

/**
 * Verifica que el esquema esté aplicado en Supabase.
 *
 * El schema real (database/schema.sql) se ejecuta UNA vez en el SQL editor
 * de Supabase (https://app.supabase.com/project/_/sql) — el cliente JS
 * no permite DDL arbitrario por seguridad. Este script confirma que las
 * tablas existen antes de aceptar tráfico.
 *
 * Uso:  npm run migrate
 */

const supabase = require('./connection');
const logger = require('../lib/logger');

const REQUIRED_TABLES = ['admins', 'customers', 'appointments'];

async function migrate() {
  // Intenta contar filas en cada tabla requerida. Si la tabla no existe,
  // Supabase devuelve error.code === '42P01' (undefined_table).
  for (const table of REQUIRED_TABLES) {
    const { error } = await supabase.from(table).select('id', { count: 'exact', head: true }).limit(0);
    if (error) {
      if (error.code === '42P01' || /does not exist/i.test(error.message || '')) {
        logger.error(
          `La tabla "${table}" no existe. Abre el SQL editor de Supabase y ejecuta:\n` +
            '  https://app.supabase.com/project/_/sql  →  database/schema.sql',
        );
        process.exit(1);
      }
      logger.error(`Error verificando tabla ${table}: ${error.message}`);
      process.exit(1);
    }
  }
  logger.info('Esquema verificado correctamente (admins, customers, appointments presentes).');
}

if (require.main === module) {
  migrate()
    .then(() => process.exit(0))
    .catch((err) => {
      logger.error('Migración falló:', err.message || err);
      process.exit(1);
    });
}

module.exports = migrate;
