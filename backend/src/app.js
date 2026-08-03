'use strict';

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const config = require('./config');
const apiRoutes = require('./api');
const { errorHandler } = require('./middleware/error');
const logger = require('./lib/logger');

const app = express();

// Detrás de un proxy inverso (Nginx/Render/Railway), confía en 1 salto para
// obtener la IP real del cliente y para que las cookies "secure" funcionen.
app.set('trust proxy', config.isProd ? 1 : false);
app.disable('x-powered-by');

// --- Cabeceras de seguridad (Helmet + CSP) ---------------------------------
// script-src estricto ('self'): ningún script inline puede ejecutarse, lo que
// neutraliza la mayoría de ataques XSS. Los estilos permiten 'unsafe-inline'
// (riesgo mucho menor) para no romper micro-ajustes de estilo en el HTML.
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'self'"],
        formAction: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        upgradeInsecureRequests: config.isProd ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  })
);

// --- Parsers ---------------------------------------------------------------
// Límite pequeño de cuerpo: el formulario es diminuto; esto frena payloads
// gigantes usados en ataques de agotamiento de memoria.
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: false, limit: '10kb' }));
app.use(cookieParser());

// --- API -------------------------------------------------------------------
app.use('/api', apiRoutes);

// --- Frontend estático -----------------------------------------------------
const frontendDir = config.paths.frontendDir;

// Ruta explícita del panel de administración.
app.get('/admin', (req, res) => res.sendFile(path.join(frontendDir, 'admin.html')));

// Archivos estáticos (CSS, JS, imágenes). index deshabilitado para controlar
// la ruta raíz manualmente.
app.use(
  express.static(frontendDir, {
    index: false,
    extensions: ['html'],
    maxAge: config.isProd ? '7d' : 0,
    setHeaders: (res, filePath) => {
      // El HTML nunca se cachea de forma agresiva para poder actualizar textos.
      if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
    },
  })
);

// Página principal.
app.get('/', (req, res) => res.sendFile(path.join(frontendDir, 'index.html')));

// --- Manejo de errores (siempre al final) ----------------------------------
app.use(errorHandler);

logger.info(`App inicializada en modo ${config.env}. Correo: ${config.mail.enabled ? 'activo' : 'desactivado'}.`);

module.exports = app;
