'use strict';

const express = require('express');
const ctrl = require('./controllers/admin.controller');
const { require: requireAdmin } = require('../../middleware/auth');
const { statusRules, listRules } = require('../../middleware/validate');
const { csrfProtection } = require('../../middleware/csrf');

const router = express.Router();

// Todas las rutas de este router exigen sesión de administrador válida.
router.use(requireAdmin);

router.get('/stats', ctrl.stats);
router.get('/appointments', listRules, ctrl.list);
router.get('/appointments/:id', ctrl.getOne);
router.patch('/appointments/:id/status', csrfProtection, statusRules, ctrl.updateStatus);

module.exports = router;
