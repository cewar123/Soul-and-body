'use strict';

/**
 * Wrapper para controladores async: captura errores y los pasa al middleware
 * de errores de Express. Evita repetir try/catch en cada controlador.
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = asyncHandler;
