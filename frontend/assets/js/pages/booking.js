/**
 * Soul and Body — Asistente de reserva (wizard de 4 pasos).
 * Conecta con la API real: catálogo, disponibilidad y creación de la cita.
 */

import { api } from '../core/api.js';
import { toast } from '../core/ui.js';
import { getConfig } from '../core/config.js';
import { businessToday, addDays, formatHumanDate } from '../services/slots.js';
import { bookingConfirmLink } from '../services/message.js';

const state = { service: '', serviceLabel: '', date: '', time: '', name: '', phone: '', email: '', notes: '' };
let cfg = null;
const TOTAL = 4;

let el = {};
const $ = (id) => document.getElementById(id);

document.addEventListener('DOMContentLoaded', init);

async function init() {
  el = {
    form: $('bookingForm'),
    steps: $('steps'),
    svcOpts: $('svcOpts'),
    date: $('bkDate'),
    slots: $('slotsBox'),
    slotsWrap: $('slotsWrap'),
    name: $('bkName'), phone: $('bkPhone'), email: $('bkEmail'), notes: $('bkNotes'),
    website: $('bkWebsite'),
    summary: $('summaryBox'),
    success: $('successBox'),
    wizard: $('wizard'),
    waConfirm: $('waConfirm'),
    refOut: $('refOut'),
  };
  if (!el.form) return;

  try {
    cfg = await getConfig();
    renderServices();
    setupDateInput();
    bindNav();
    goStep(1);
  } catch {
    toast('No se pudo cargar el formulario de reservas. Recarga la página.', 'err');
    return;
  }

  // Si la clienta está logueada, pre-rellenamos sus datos y los protegemos.
  try {
    const me = await api.get('/customer/me');
    prefillFromAccount(me.data);
    personalizeNav(me.data);
  } catch {
    /* guest: noop */
  }
}

function prefillFromAccount(me) {
  if (!me) return;
  if (me.name && el.name) {
    el.name.value = me.name;
    el.name.readOnly = true;
    el.name.title = 'Dato de tu cuenta. Para cambiarlo, edita tu perfil.';
  }
  if (me.phone && el.phone) {
    el.phone.value = me.phone;
    el.phone.readOnly = true;
    el.phone.title = 'Dato de tu cuenta. Para cambiarlo, edita tu perfil.';
  }
  if (me.email && el.email) {
    el.email.value = me.email;
    el.email.readOnly = true;
    el.email.title = 'Dato de tu cuenta. Para cambiarlo, edita tu perfil.';
  }
}

function personalizeNav(me) {
  const nav = document.getElementById('navCuenta');
  if (nav && me.name) {
    nav.textContent = me.name.split(' ')[0] || 'Mi cuenta';
    nav.setAttribute('href', './cuenta.html');
  }
}

function renderServices() {
  el.svcOpts.innerHTML = '';
  cfg.services.forEach((s) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'svc-opt';
    b.textContent = s.label;
    b.dataset.id = s.id;
    b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', () => {
      state.service = s.id; state.serviceLabel = s.label;
      Array.from(el.svcOpts.children).forEach((c) => {
        c.classList.remove('sel');
        c.setAttribute('aria-pressed', 'false');
      });
      b.classList.add('sel');
      b.setAttribute('aria-pressed', 'true');
      $('toStep2').disabled = false;
    });
    el.svcOpts.appendChild(b);
  });
  $('toStep2').disabled = true;
}

function setupDateInput() {
  const today = businessToday(cfg.timezone);
  el.date.min = today;
  el.date.max = addDays(today, cfg.horizonDays);
  el.date.addEventListener('change', onDateChange);
}

async function onDateChange() {
  state.date = el.date.value;
  state.time = '';
  $('toStep3').disabled = true;
  if (!state.date) { el.slotsWrap.style.display = 'none'; return; }

  const weekday = new Date(`${state.date}T12:00:00`).getDay();
  if (cfg.openWeekdays.indexOf(weekday) === -1) {
    el.slotsWrap.style.display = 'block';
    el.slots.innerHTML = '<div class="slots-empty">Ese día no hay atención. Elige otra fecha, por favor.</div>';
    return;
  }

  el.slotsWrap.style.display = 'block';
  el.slots.innerHTML = '<div class="center-load"><div class="spinner dark"></div></div>';

  try {
    const res = await api.get(`/availability?date=${encodeURIComponent(state.date)}`);
    renderSlots(res.data.slots);
  } catch (e) {
    el.slots.innerHTML = `<div class="slots-empty">${e.error || 'No se pudo cargar la disponibilidad.'}</div>`;
  }
}

function renderSlots(slots) {
  el.slots.innerHTML = '';
  const available = slots.filter((s) => s.available);
  if (available.length === 0) {
    el.slots.innerHTML = '<div class="slots-empty">No quedan horarios libres este día. Prueba otra fecha.</div>';
    return;
  }
  slots.forEach((s) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'slot';
    b.textContent = s.time;
    b.disabled = !s.available;
    if (!s.available) b.title = 'No disponible';
    b.addEventListener('click', () => {
      state.time = s.time;
      Array.from(el.slots.children).forEach((c) => c.classList.remove('sel'));
      b.classList.add('sel');
      $('toStep3').disabled = false;
    });
    el.slots.appendChild(b);
  });
}

const RE = {
  name: /^[\p{L}\p{M}][\p{L}\p{M} .'’-]*$/u,
  phone: /^\+?\d{7,15}$/,
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
};

function setError(fieldId, message) {
  const field = $(fieldId).closest('.field');
  const err = field.querySelector('.err');
  if (message) { field.classList.add('invalid'); if (err) err.textContent = message; }
  else { field.classList.remove('invalid'); }
  return !message;
}

function validateDetails() {
  let ok = true;
  const name = el.name.value.trim();
  const phone = el.phone.value.replace(/[^\d+]/g, '');
  const email = el.email.value.trim();

  if (name.length < 2 || name.length > 80 || !RE.name.test(name)) {
    ok = setError('bkName', 'Ingresa un nombre válido.') && ok;
  } else setError('bkName', '');

  if (!RE.phone.test(phone)) {
    ok = setError('bkPhone', 'Teléfono inválido (7 a 15 dígitos).') && ok;
  } else setError('bkPhone', '');

  if (email && !RE.email.test(email)) {
    ok = setError('bkEmail', 'Correo inválido.') && ok;
  } else setError('bkEmail', '');

  if (ok) {
    state.name = name; state.phone = phone;
    state.email = email; state.notes = el.notes.value.trim();
  }
  return ok;
}

function renderSummary() {
  const human = formatHumanDate(state.date, cfg.timezone);
  const rows = [
    ['Servicio', state.serviceLabel],
    ['Fecha', human],
    ['Hora', state.time],
    ['Nombre', state.name],
    ['Teléfono', state.phone],
  ];
  if (state.email) rows.push(['Correo', state.email]);
  el.summary.innerHTML = rows.map(() => '<div class="row"><span class="k"></span><span class="v"></span></div>').join('');
  // Se rellena con textContent para evitar cualquier inyección
  Array.from(el.summary.querySelectorAll('.row')).forEach((row, i) => {
    row.querySelector('.k').textContent = rows[i][0];
    row.querySelector('.v').textContent = rows[i][1];
  });
}

async function submit() {
  const btn = $('confirmBtn');
  setBtnLoading(btn, true);
  try {
    const payload = {
      name: state.name, phone: state.phone, email: state.email || undefined,
      service: state.service, date: state.date, time: state.time,
      notes: state.notes || undefined, website: el.website.value,
    };
    const res = await api.post('/bookings', payload);
    showSuccess(res.data);
  } catch (e) {
    handleSubmitError(e);
  } finally {
    setBtnLoading(btn, false);
  }
}

function handleSubmitError(e) {
  if (e && e.code === 'VALIDATION' && e.fields) {
    e.fields.forEach((f) => {
      const map = { name: 'bkName', phone: 'bkPhone', email: 'bkEmail', notes: 'bkNotes' };
      if (map[f.field]) setError(map[f.field], f.message);
    });
    goStep(3);
    toast('Revisa los datos marcados.', 'err');
    return;
  }
  if (e && e.code === 'SLOT_TAKEN') {
    toast(e.error, 'err');
    goStep(2);
    onDateChange();
    return;
  }
  toast((e && e.error) || 'No se pudo completar la reserva. Inténtalo de nuevo.', 'err');
}

function showSuccess(data) {
  el.wizard.style.display = 'none';
  el.steps.style.display = 'none';
  el.success.style.display = 'block';
  el.refOut.textContent = data.reference;

  if (cfg.whatsapp) {
    el.waConfirm.href = bookingConfirmLink({
      whatsapp: cfg.whatsapp,
      name: data.name,
      serviceLabel: data.serviceLabel,
      date: data.date,
      time: data.time,
      reference: data.reference,
    });
    el.waConfirm.style.display = 'inline-flex';
  } else {
    el.waConfirm.style.display = 'none';
  }

  const note = $('successNote');
  if (note) {
    note.textContent = data.notifications && data.notifications.client
      ? 'Te enviamos una copia a tu correo.'
      : 'Wendy revisará tu solicitud y te confirmará por WhatsApp.';
  }
  el.success.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function bindNav() {
  $('toStep2').addEventListener('click', () => goStep(2));
  $('toStep3').addEventListener('click', () => goStep(3));
  $('backTo1').addEventListener('click', () => goStep(1));
  $('backTo2').addEventListener('click', () => goStep(2));
  $('backTo3').addEventListener('click', () => goStep(3));
  $('toStep4').addEventListener('click', () => {
    if (validateDetails()) { renderSummary(); goStep(4); }
  });
  $('confirmBtn').addEventListener('click', submit);
}

function goStep(n) {
  Array.from(document.querySelectorAll('.step')).forEach((s) => {
    s.classList.toggle('active', Number(s.dataset.step) === n);
  });
  Array.from(el.steps.children).forEach((dot, i) => {
    dot.classList.toggle('active', i === n - 1);
    dot.classList.toggle('done', i < n - 1);
  });
  const active = document.querySelector(`.step[data-step="${n}"] h3`);
  if (active) { active.setAttribute('tabindex', '-1'); active.focus(); }
}

function setBtnLoading(btn, loading) {
  if (!btn) return;
  if (loading) {
    btn.dataset.label = btn.textContent;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Enviando...';
  } else {
    btn.disabled = false;
    btn.textContent = btn.dataset.label || 'Confirmar';
  }
}
