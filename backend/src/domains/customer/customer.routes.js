'use strict';

const express = require('express');
const ctrl = require('./controllers/auth.controller');
const session = require('./customer.auth');

const router = express.Router();

// Rutas públicas con rate limiting.
router.post('/register', ctrl.authLimiter, ctrl.register);
router.post('/login', ctrl.authLimiter, ctrl.login);

// Rutas protegidas (requieren sesión de cliente).
router.post('/logout', session.require, ctrl.logout);
router.get('/me', session.require, ctrl.me);
router.patch('/profile', session.require, ctrl.updateProfile);
router.post('/change-password', session.require, ctrl.changePassword);

module.exports = router;
