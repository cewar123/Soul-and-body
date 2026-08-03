'use strict';

const express = require('express');
const ctrl = require('./controllers/auth.controller');
const { require: requireAdmin } = require('../../middleware/auth');
const { loginRules, passwordChangeRules } = require('../../middleware/validate');
const { loginLimiter } = require('../../middleware/rateLimit');
const { csrfProtection } = require('../../middleware/csrf');

const router = express.Router();

router.post('/login', csrfProtection, loginLimiter, loginRules, ctrl.login);
router.post('/logout', csrfProtection, ctrl.logout);
router.get('/me', requireAdmin, ctrl.me);
router.post('/change-password', csrfProtection, requireAdmin, passwordChangeRules, ctrl.changePassword);

module.exports = router;
