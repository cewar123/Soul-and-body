'use strict';

/**
 * Cliente Supabase (server-side, service_role).
 *
 * El backend usa SIEMPRE el cliente con service_role key: bypasea RLS
 * y permite hacer operaciones administrativas. NUNCA expongas esta key
 * al frontend; debe quedarse en variables de entorno del servidor.
 *
 * El cliente se crea de forma perezosa: solo falla si se usa sin credenciales,
 * lo que permite importar modelos en tests sin necesidad de Supabase real.
 */

const { createClient } = require('@supabase/supabase-js');
const config = require('../config');
const logger = require('../lib/logger');

let _client = null;

function getClient() {
  if (_client) return _client;
  if (!config.supabase.url || !config.supabase.serviceRoleKey) {
    logger.error(
      'Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env. ' +
        'Crea un proyecto en https://supabase.com y completa las variables.',
    );
    throw new Error('Supabase no configurado: faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.');
  }
  _client = createClient(config.supabase.url, config.supabase.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _client;
}

// Proxy: delega todas las llamadas a getClient().from(...) etc.
const handler = {
  get(_target, prop) {
    const client = getClient();
    const value = client[prop];
    return typeof value === 'function' ? value.bind(client) : value;
  },
};

module.exports = new Proxy({}, handler);
