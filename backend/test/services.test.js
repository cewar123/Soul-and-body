'use strict';

const assert = require('node:assert/strict');
const { test } = require('./helpers');

test('availability.allSlotsForDate genera bloques para un día laborable', () => {
  const time = require('../src/lib/time');
  const availability = require('../src/domains/booking/services/availability.service');
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

test('availability.isWorkingDay devuelve false para domingo', () => {
  const time = require('../src/lib/time');
  const availability = require('../src/domains/booking/services/availability.service');
  let sunday = time.getBusinessNowParts().dateStr;
  for (let i = 0; i < 14; i += 1) {
    sunday = time.addDays(sunday, 1);
    if (time.businessWeekday(sunday) === 0) break;
  }
  assert.equal(availability.isWorkingDay(sunday), false);
});

test('email.service.esc escapa HTML correctamente', () => {
  const emailService = require('../src/domains/notifications/email.service');
  const input = '<script>alert("xss & \' \'")</script>';
  const out = emailService.esc(input);
  assert.equal(out, '&lt;script&gt;alert(&quot;xss &amp; &#39; &#39;&quot;)&lt;/script&gt;');
});

test('format.serviceLabel devuelve label o id', () => {
  const { serviceLabel } = require('../src/lib/format');
  assert.equal(serviceLabel('facial'), 'Tratamiento facial');
  assert.equal(serviceLabel('no-existe'), 'no-existe');
});

test('format.formatDate produce fecha en español', () => {
  const { formatDate } = require('../src/lib/format');
  const out = formatDate('2026-07-15');
  assert.match(out, /2026/);
  assert.match(out, /jul|07/);
});

test('lib.errors.DomainError tiene status 400', () => {
  const { DomainError } = require('../src/lib/errors');
  const e = new DomainError('msg', 'CODE');
  assert.equal(e.name, 'DomainError');
  assert.equal(e.status, 400);
  assert.equal(e.code, 'CODE');
});

test('time.getBusinessNowParts devuelve fecha y hora en la zona del negocio', () => {
  const time = require('../src/lib/time');
  const now = time.getBusinessNowParts();
  assert.match(now.dateStr, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(now.timeStr, /^\d{2}:\d{2}$/);
});
