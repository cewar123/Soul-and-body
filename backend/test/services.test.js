'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { withFreshApp } = require('./helpers');

test('availability.allSlotsForDate genera bloques para un día laborable', async () => {
  await withFreshApp(async ({ app, request, config }) => {
    const time = require('../src/lib/time');
    const availability = require('../src/domains/booking/services/availability.service');
    // Encontrar un lunes próximo.
    const today = time.getBusinessNowParts().dateStr;
    let monday = today;
    for (let i = 0; i < 14; i += 1) {
      monday = time.addDays(today, i);
      if (time.businessWeekday(monday) === 1) break;
    }
    const slots = availability.allSlotsForDate(monday);
    assert.ok(slots.length > 0);
    assert.ok(slots.includes('09:00'));
    assert.ok(slots.includes('17:00'));
  });
});

test('availability.isWorkingDay devuelve false para domingo', async () => {
  await withFreshApp(async ({ app, request }) => {
    const time = require('../src/lib/time');
    const availability = require('../src/domains/booking/services/availability.service');
    let sunday = time.getBusinessNowParts().dateStr;
    for (let i = 0; i < 14; i += 1) {
      sunday = time.addDays(sunday, 1);
      if (time.businessWeekday(sunday) === 0) break;
    }
    assert.equal(availability.isWorkingDay(sunday), false);
  });
});

test('email.service.esc escapa HTML correctamente', async () => {
  await withFreshApp(async ({ app, request }) => {
    const emailService = require('../src/domains/notifications/email.service');
    const input = '<script>alert("xss & \' \'")</script>';
    const out = emailService.esc(input);
    assert.equal(out, '&lt;script&gt;alert(&quot;xss &amp; &#39; &#39;&quot;)&lt;/script&gt;');
  });
});

test('format.serviceLabel devuelve label o id', async () => {
  await withFreshApp(async ({ app, request }) => {
    const { serviceLabel } = require('../src/lib/format');
    assert.equal(serviceLabel('facial'), 'Tratamiento facial');
    assert.equal(serviceLabel('no-existe'), 'no-existe');
  });
});

test('format.formatDate produce fecha en español', async () => {
  await withFreshApp(async ({ app, request }) => {
    const { formatDate } = require('../src/lib/format');
    const out = formatDate('2026-07-15');
    // El formato exacto depende del locale del SO; verificamos los componentes clave.
    assert.match(out, /2026/);
    assert.match(out, /jul|07/);
  });
});

test('lib.errors.DomainError tiene status 400', async () => {
  await withFreshApp(async ({ app, request }) => {
    const { DomainError } = require('../src/lib/errors');
    const e = new DomainError('msg', 'CODE');
    assert.equal(e.name, 'DomainError');
    assert.equal(e.status, 400);
    assert.equal(e.code, 'CODE');
  });
});
