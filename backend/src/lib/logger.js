'use strict';

/**
 * Logger minimalista con marca de tiempo y nivel. Se mantiene sin dependencias
 * para no inflar el proyecto; si en el futuro se necesita rotación de logs o
 * transporte externo, basta con sustituir esta implementación por pino/winston
 * conservando la misma interfaz.
 */

function ts() {
  return new Date().toISOString();
}

function format(level, args) {
  return [`[${ts()}] [${level}]`, ...args];
}

module.exports = {
  info: (...args) => console.log(...format('INFO', args)),
  warn: (...args) => console.warn(...format('WARN', args)),
  error: (...args) => console.error(...format('ERROR', args)),
  debug: (...args) => {
    if (process.env.NODE_ENV !== 'production') console.log(...format('DEBUG', args));
  },
};
