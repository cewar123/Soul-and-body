'use strict';

const express = require('express');
const { apiLimiter } = require('../middleware/rateLimit');
const { notFound } = require('../middleware/error');

const { router: configRoutes } = require('../domain/config');
const { router: bookingRoutes } = require('../domain/booking');
const { router: authRoutes } = require('../domain/auth');
const { router: adminRoutes } = require('../domain/admin');
const { router: customerRoutes } = require('../domain/customer');

const router = express.Router();

// Límite general de la API.
router.use(apiLimiter);

// Estado de salud (útil para monitoreo / balanceadores).
router.get('/health', (req, res) => res.json({ ok: true, status: 'up', ts: new Date().toISOString() }));

// --- Rutas PÚBLICAS (sin CSRF) ---
router.use('/', configRoutes);          // /config, /csrf-token
router.use('/', bookingRoutes);         // /availability
router.use('/customer', customerRoutes); // /customer/register, /customer/login

// --- Rutas con CSRF (modifican estado) ---
router.use('/auth', authRoutes);         // /auth/login, /auth/logout, /auth/me, /auth/change-password

// --- Panel de administración (sesión requerida) ---
router.use('/admin', adminRoutes);       // /admin/stats, /admin/appointments

// 404 para cualquier ruta de API no definida.
router.use(notFound);

module.exports = router;
