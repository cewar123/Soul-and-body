'use strict';

const assert = require('node:assert/strict');
const { withFreshApp, test } = require('./helpers');

test('GET /api/health responde ok', async (t) => {
  await withFreshApp(t, async ({ app, request }) => {
    const res = await request(app).get('/api/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.status, 'up');
    assert.ok(res.body.ts);
  });
});

test('GET /api/config devuelve brand, servicios y whatsapp', async (t) => {
  await withFreshApp(t, async ({ app, request, config }) => {
    const res = await request(app).get('/api/config');
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.data.brand.name, 'Soul and Body');
    assert.ok(Array.isArray(res.body.data.services));
    assert.ok(res.body.data.services.length >= 1);
    assert.equal(res.body.data.whatsapp, config.business.whatsapp);
    assert.equal(res.body.data.timezone, 'America/Bogota');
    assert.ok(Array.isArray(res.body.data.openWeekdays));
  });
});

test('GET /api/csrf-token emite token y cookie', async (t) => {
  await withFreshApp(t, async ({ app, request }) => {
    const res = await request(app).get('/api/csrf-token');
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.ok(typeof res.body.csrfToken === 'string');
    assert.ok(res.body.csrfToken.length >= 32);
    const cookies = res.headers['set-cookie'] || [];
    assert.ok(cookies.some((c) => c.startsWith('sb_csrf=')));
  });
});

test('GET /api/availability con fecha inválida responde 422', async (t) => {
  await withFreshApp(t, async ({ app, request }) => {
    const res = await request(app).get('/api/availability?date=no-es-fecha');
    assert.equal(res.status, 422);
    assert.equal(res.body.code, 'VALIDATION');
  });
});

test('GET /api/availability con fecha en domingo (cerrado) responde 400', async (t) => {
  await withFreshApp(t, async ({ app, request }) => {
    const time = require('../src/lib/time');
    const today = time.getBusinessNowParts().dateStr;
    let sunday = today;
    for (let i = 0; i < 14; i += 1) {
      sunday = time.addDays(today, i);
      if (time.businessWeekday(sunday) === 0) break;
    }
    const res = await request(app).get(`/api/availability?date=${sunday}`);
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'DATE_CLOSED');
  });
});

test('POST /api/bookings sin CSRF es rechazado con 403', async (t) => {
  await withFreshApp(t, async ({ app, request }) => {
    const res = await request(app)
      .post('/api/bookings')
      .send({
        name: 'Test User',
        phone: '3001234567',
        service: 'facial',
        date: '2099-01-15',
        time: '10:00',
      });
    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'CSRF');
  });
});

test('POST /api/auth/login con credenciales incorrectas responde 401', async (t) => {
  await withFreshApp(t, async ({ app, request }) => {
    const csrfRes = await request(app).get('/api/csrf-token');
    const csrfToken = csrfRes.body.csrfToken;
    const csrfCookie = csrfRes.headers['set-cookie'].find((c) => c.startsWith('sb_csrf='));

    const res = await request(app)
      .post('/api/auth/login')
      .set('Cookie', csrfCookie)
      .set('x-csrf-token', csrfToken)
      .send({ username: 'testadmin', password: 'wrong-password' });

    assert.equal(res.status, 401);
    assert.equal(res.body.code, 'BAD_CREDENTIALS');
  });
});

test('GET /api/auth/me sin sesión responde 401', async (t) => {
  await withFreshApp(t, async ({ app, request }) => {
    const res = await request(app).get('/api/auth/me');
    assert.equal(res.status, 401);
    assert.equal(res.body.code, 'NO_SESSION');
  });
});

test('GET /api/admin/appointments sin sesión responde 401', async (t) => {
  await withFreshApp(t, async ({ app, request }) => {
    const res = await request(app).get('/api/admin/appointments');
    assert.equal(res.status, 401);
    assert.equal(res.body.code, 'NO_SESSION');
  });
});

test('POST /api/customer/register con body incompleto responde 422', async (t) => {
  await withFreshApp(t, async ({ app, request }) => {
    const res = await request(app)
      .post('/api/customer/register')
      .send({ email: 'no-es-email' });
    assert.equal(res.status, 422);
    assert.equal(res.body.code, 'VALIDATION');
  });
});
