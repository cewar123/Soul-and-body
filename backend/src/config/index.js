'use strict';

const path = require('path');
const crypto = require('crypto');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const business = require('./business');

const isProd = process.env.NODE_ENV === 'production';

/**
 * Lee una variable de entorno con validación. En producción, la ausencia de
 * un secreto obligatorio detiene el arranque (fail-fast) para no correr en un
 * estado inseguro. En desarrollo se genera un valor efímero y se advierte.
 */
function required(name, fallbackGenerator) {
  const value = process.env[name];
  if (value && value.trim() !== '' && !value.startsWith('CAMBIA')) {
    return value;
  }
  if (isProd) {
    console.error(`\n[FATAL] Falta la variable de entorno obligatoria: ${name}`);
    process.exit(1);
  }
  const generated = fallbackGenerator ? fallbackGenerator() : '';
  console.warn(
    `[aviso] ${name} no está configurada; usando un valor temporal de desarrollo. ` +
      'Configúrala en .env antes de desplegar.'
  );
  return generated;
}

const randomSecret = () => crypto.randomBytes(48).toString('hex');

const config = {
  isProd,
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3000,
  publicUrl: (process.env.PUBLIC_URL || 'http://localhost:3000').replace(/\/$/, ''),

  supabase: {
    url: process.env.SUPABASE_URL || '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  },

  security: {
    jwtSecret: required('JWT_SECRET', randomSecret),
    sessionTtl: process.env.SESSION_TTL || '8h',
  },

  admin: {
    username: process.env.ADMIN_USERNAME || 'admin',
    password: process.env.ADMIN_PASSWORD || '',
  },

  business: {
    ...business,
    timezone: process.env.BUSINESS_TZ || business.timezone || 'America/Bogota',
    email: process.env.BUSINESS_EMAIL || '',
    whatsapp: (process.env.BUSINESS_WHATSAPP || '').replace(/[^\d]/g, ''),
  },

  mail: {
    host: process.env.SMTP_HOST || '',
    port: parseInt(process.env.SMTP_PORT, 10) || 587,
    secure: String(process.env.SMTP_SECURE).toLowerCase() === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    fromName: process.env.MAIL_FROM_NAME || business.brand.name,
    fromEmail: process.env.MAIL_FROM_EMAIL || process.env.SMTP_USER || '',
    /** El correo solo está activo si hay host, usuario y contraseña. */
    get enabled() {
      return Boolean(this.host && this.user && this.pass);
    },
  },

  paths: {
    dataDir: path.resolve(__dirname, '../../data'),
    dbFile: path.resolve(__dirname, '../../data/soul-and-body.db'),
    frontendDir: path.resolve(__dirname, '../../../frontend'),
  },
};

module.exports = config;
