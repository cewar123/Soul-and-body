'use strict';

/**
 * Errores de dominio y HTTP.
 * - DomainError: regla de negocio violada -> el handler lo traduce a 400.
 * - HttpError: respuesta HTTP explícita con status arbitrario.
 */

class DomainError extends Error {
  constructor(message, code = 'INVALID') {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.status = 400;
  }
}

class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
  }
}

module.exports = { DomainError, HttpError };
