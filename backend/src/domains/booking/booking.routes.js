'use strict';

const express = require('express');
const ctrl = require('./controllers/booking.controller');
const { bookingRules, availabilityRules } = require('../../middleware/validate');
const { bookingLimiter } = require('../../middleware/rateLimit');
const { csrfProtection } = require('../../middleware/csrf');

const router = express.Router();

router.get('/availability', availabilityRules, ctrl.getAvailability);
router.post('/bookings', csrfProtection, bookingLimiter, bookingRules, ctrl.createBooking);

module.exports = router;
