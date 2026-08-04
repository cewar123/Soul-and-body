'use strict';

const express = require('express');
const ctrl = require('./controllers/booking.controller');
const { bookingRules, availabilityRules } = require('../../middleware/validate');
const { bookingLimiter } = require('../../middleware/rateLimit');
const { csrfProtection } = require('../../middleware/csrf');
const customerSession = require('../customer/customer.auth');

const router = express.Router();

/**
 * Si el cliente está logueado (cookie sb_customer_session), lo adjuntamos
 * en req.customer. Si no, sigue siendo un guest. Esto permite que la cita
 * se asocie a la cuenta cuando el cliente decide crearla justo después.
 */
router.post(
  '/bookings',
  customerSession.optional,
  csrfProtection,
  bookingLimiter,
  bookingRules,
  ctrl.createBooking,
);

router.get('/availability', availabilityRules, ctrl.getAvailability);

module.exports = router;
