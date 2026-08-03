'use strict';

const config = require('../config');

/**
 * Devuelve la etiqueta legible de un servicio a partir de su id interno.
 * Si no se encuentra, devuelve el id tal cual (nunca rompe la respuesta).
 */
function serviceLabel(serviceId) {
  const found = config.business.services.find((s) => s.id === serviceId);
  return found ? found.label : serviceId;
}

/**
 * Formatea una fecha "YYYY-MM-DD" a "DD MMM YYYY" en español (CO).
 */
function formatDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * Formatea una fecha "YYYY-MM-DD" a texto largo en español (CO).
 * Ej: "miércoles, 15 de julio de 2026".
 */
function formatHumanDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('es-CO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: config.business.timezone,
  });
}

module.exports = { serviceLabel, formatDate, formatHumanDate };
