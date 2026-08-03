'use strict';

const express = require('express');
const ctrl = require('./controllers/config.controller');

const router = express.Router();

router.get('/config', ctrl.getConfig);
router.get('/csrf-token', ctrl.getCsrfToken);

module.exports = router;
