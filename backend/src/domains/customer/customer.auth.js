'use strict';

const buildSession = require('../../middleware/session');

const THIRTY_DAYS_MS = 1000 * 60 * 60 * 24 * 30;

const customerSession = buildSession({
  cookieName: 'sb_customer_session',
  ttl: THIRTY_DAYS_MS,
  getPayload: (customer) => ({ sub: customer.id, email: customer.email, name: customer.name }),
  getEntity: (payload) => ({ reqKey: 'customer', value: { id: payload.sub, email: payload.email, name: payload.name } }),
});

module.exports = customerSession;
