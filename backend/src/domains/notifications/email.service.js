'use strict';

const nodemailer = require('nodemailer');
const config = require('../../config');
const logger = require('../../lib/logger');
const { serviceLabel, formatDate } = require('../../lib/format');

/**
 * Servicio de correo con DEGRADACIÓN ELEGANTE: si el SMTP no está configurado
 * (o falla el envío), la reserva NO se pierde: se guarda igual y el sistema
 * sigue operando. El correo es una notificación, nunca un punto único de fallo.
 */

let transporter = null;

if (config.mail.enabled) {
  transporter = nodemailer.createTransport({
    host: config.mail.host,
    port: config.mail.port,
    secure: config.mail.secure, // true para 465, false para 587 (STARTTLS)
    auth: { user: config.mail.user, pass: config.mail.pass },
  });
  transporter
    .verify()
    .then(() => logger.info('SMTP verificado: el envío de correos está activo.'))
    .catch((err) =>
      logger.warn(`SMTP configurado pero no verifica (${err.message}). Se reintentará al enviar.`)
    );
} else {
  logger.warn('SMTP no configurado: las reservas se guardan pero no se enviarán correos.');
}

/**
 * Escapa texto para incrustarlo con seguridad en HTML (anti-XSS en emails).
 * Reemplaza los cinco caracteres que rompen o alteran la estructura HTML.
 */
function esc(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const brandColor = '#b56f6a';

function shell(title, bodyHtml) {
  return `<!doctype html><html><body style="margin:0;background:#faf5f1;font-family:Segoe UI,Arial,sans-serif;color:#2a2320">
  <div style="max-width:560px;margin:0 auto;padding:24px">
    <div style="text-align:center;padding:12px 0 20px">
      <div style="font-family:Georgia,serif;font-size:24px;color:${brandColor};font-weight:600">Soul and Body</div>
      <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#8a7a72">Centro Estético · Envigado</div>
    </div>
    <div style="background:#fffdfb;border:1px solid #ecdfd7;border-radius:14px;padding:28px">
      <h1 style="font-family:Georgia,serif;font-size:20px;margin:0 0 14px">${esc(title)}</h1>
      ${bodyHtml}
    </div>
    <p style="text-align:center;color:#8a7a72;font-size:12px;margin-top:18px">
      ${esc(config.business.brand.address)}
    </p>
  </div></body></html>`;
}

function detailsTable(appt) {
  const rows = [
    ['Código', appt.reference],
    ['Nombre', appt.name],
    ['Servicio', serviceLabel(appt.service)],
    ['Fecha', formatDate(appt.date)],
    ['Hora', appt.time],
    ['Teléfono', appt.phone],
    appt.email ? ['Correo', appt.email] : null,
    appt.notes ? ['Notas', appt.notes] : null,
  ].filter(Boolean);

  return `<table style="width:100%;border-collapse:collapse;font-size:14px">${rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:7px 0;color:#8a7a72;width:34%">${esc(k)}</td>
         <td style="padding:7px 0;font-weight:600">${esc(v)}</td></tr>`
    )
    .join('')}</table>`;
}

function clientEmail(appt) {
  const body = `
    <p style="font-size:15px;color:#5a4a42">Hola ${esc(appt.name)}, recibimos tu solicitud de cita. 🌸</p>
    <p style="font-size:14px;color:#8a7a72">Wendy la revisará y te confirmará por WhatsApp. Estos son los datos:</p>
    ${detailsTable(appt)}
    <p style="font-size:13px;color:#8a7a72;margin-top:16px">
      Guarda tu código <b>${esc(appt.reference)}</b> por si necesitas modificar o cancelar.
      Si no fuiste tú, ignora este mensaje.
    </p>`;
  return { subject: `Tu solicitud de cita · ${appt.reference}`, html: shell('¡Tu cita quedó solicitada!', body) };
}

function ownerEmail(appt) {
  const wa = config.business.whatsapp
    ? `https://wa.me/${config.business.whatsapp}?text=${encodeURIComponent(
        `Hola ${appt.name}, te confirmo tu cita de ${serviceLabel(appt.service)} el ${formatDate(
          appt.date
        )} a las ${appt.time}. — Soul and Body`
      )}`
    : null;

  const body = `
    <p style="font-size:15px;color:#5a4a42">Nueva solicitud de cita.</p>
    ${detailsTable(appt)}
    ${
      wa
        ? `<a href="${wa}" style="display:inline-block;margin-top:18px;background:#25D366;color:#fff;
              text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:700;font-size:14px">
              Confirmar por WhatsApp →</a>`
        : ''
    }
    <p style="font-size:12px;color:#8a7a72;margin-top:16px">Gestiona esta cita en el panel de administración.</p>`;
  return { subject: `Nueva cita · ${appt.name} · ${formatDate(appt.date)} ${appt.time}`, html: shell('Nueva solicitud de cita', body) };
}

async function send(to, { subject, html }) {
  if (!transporter || !to) return false;
  const from = `"${config.mail.fromName}" <${config.mail.fromEmail}>`;
  await transporter.sendMail({ from, to, subject, html });
  return true;
}

/**
 * Envía las notificaciones de una reserva (a la clienta y al negocio) sin
 * bloquear ni romper el flujo si algo falla. Devuelve un resumen.
 */
async function sendBookingNotifications(appt) {
  const result = { owner: false, client: false, enabled: config.mail.enabled };
  if (!config.mail.enabled) return result;

  const tasks = [];
  if (config.business.email) {
    tasks.push(
      send(config.business.email, ownerEmail(appt))
        .then(() => { result.owner = true; })
        .catch((err) => logger.warn(`No se pudo enviar correo al negocio: ${err.message}`))
    );
  }
  if (appt.email) {
    tasks.push(
      send(appt.email, clientEmail(appt))
        .then(() => { result.client = true; })
        .catch((err) => logger.warn(`No se pudo enviar correo a la clienta: ${err.message}`))
    );
  }
  await Promise.allSettled(tasks);
  return result;
}

module.exports = { sendBookingNotifications, esc };
