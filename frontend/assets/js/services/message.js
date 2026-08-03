/**
 * Soul and Body — Plantillas de mensajes para WhatsApp click-to-chat.
 * @module services/message
 */

/** Enlace wa.me con un mensaje prellenado para confirmar una cita. */
export function bookingConfirmLink({ whatsapp, name, serviceLabel, date, time, reference }) {
  const msg = `Hola, soy ${name}. Acabo de reservar ${serviceLabel} para el ${date} a las ${time}. Mi código es ${reference}.`;
  return `https://wa.me/${whatsapp}?text=${encodeURIComponent(msg)}`;
}

/** Enlace wa.me para que el admin escriba a una clienta. */
export function adminContactLink({ phone, name, serviceLabel, date, time, reference }) {
  const normalized = String(phone).replace(/[^\d]/g, '');
  const withCountry = normalized.length === 10 ? `57${normalized}` : normalized;
  const msg = `Hola ${name}, te escribo de Soul and Body sobre tu cita de ${serviceLabel} el ${date} a las ${time} (código ${reference}).`;
  return `https://wa.me/${withCountry}?text=${encodeURIComponent(msg)}`;
}

/** Enlace wa.me genérico al negocio. */
export function businessLink(whatsapp, text) {
  const msg = text || 'Hola, me gustaría información sobre sus servicios.';
  return `https://wa.me/${whatsapp}?text=${encodeURIComponent(msg)}`;
}
