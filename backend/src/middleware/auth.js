'use strict';

const buildSession = require('./session');

const HOURS_8_MS = 1000 * 60 * 60 * 8;

const adminSession = buildSession({
  cookieName: 'sb_session',
  ttl: HOURS_8_MS,
  getPayload: (admin) => ({ sub: admin.id, username: admin.username }),
  getEntity: (payload) => ({ reqKey: 'admin', value: { id: payload.sub, username: payload.username } }),
});

module.exports = adminSession;
