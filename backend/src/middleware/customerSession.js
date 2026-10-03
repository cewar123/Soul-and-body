'use strict';

const buildSession = require('./session');

const THIRTY_DAYS_MS = 1000 * 60 * 60 * 24 * 30;

/**
 * Sesión de cliente (cookie sb_customer_session). Vivía en el dominio
 * customer, pero booking.js también la necesita para adjuntar la sesión
 * opcional al crear reservas; al ser middleware de sesión, vive aquí para
 * no crear una dependencia circular booking ↔ customer.
 */
const customerSession = buildSession({
  cookieName: 'sb_customer_session',
  ttl: THIRTY_DAYS_MS,
  getPayload: (customer) => ({ sub: customer.id, email: customer.email, name: customer.name }),
  getEntity: (payload) => ({ reqKey: 'customer', value: { id: payload.sub, email: payload.email, name: payload.name } }),
});

module.exports = customerSession;
