/**
 * Soul and Body — Módulo de cuenta de cliente.
 *
 * Renderiza diferentes vistas según el estado de autenticación:
 *   - Sin sesión  → formularios de login y registro (tabs).
 *   - Con sesión  → perfil, "mis citas" y cerrar sesión.
 *
 * Sigue el patrón del resto del frontend: API centralizada en core/api.js,
 * toasts en core/ui.js, mensajes WhatsApp en services/message.js.
 */

import { api } from '../core/api.js';
import { toast } from '../core/ui.js';
import { formatShortDate } from '../services/slots.js';
import { businessLink } from '../services/message.js';

const $ = (id) => document.getElementById(id);

const STATUS_LABEL = { pending: 'Pendiente', confirmed: 'Confirmada', cancelled: 'Cancelada', completed: 'Completada' };

document.addEventListener('DOMContentLoaded', init);

async function init() {
  bindAuthForms();
  bindProfile();
  bindTabs();
  bindLogout();
  await refresh();
}

async function refresh() {
  try {
    const me = await api.get('/customer/me');
    showApp(me.data);
  } catch {
    showGuest();
  }
}

/* ---------- Guest: login + registro ---------- */

function showGuest() {
  $('guestPanel').style.display = 'block';
  $('appPanel').style.display = 'none';
  $('navCuenta').textContent = 'Mi cuenta';
  $('navCuenta').setAttribute('href', './cuenta.html');
}

function bindTabs() {
  const tabLogin = $('tabLogin');
  const tabRegister = $('tabRegister');
  const loginForm = $('loginForm');
  const registerForm = $('registerForm');
  if (!tabLogin || !tabRegister) return;

  function activate(which) {
    const isLogin = which === 'login';
    tabLogin.setAttribute('aria-selected', isLogin ? 'true' : 'false');
    tabRegister.setAttribute('aria-selected', isLogin ? 'false' : 'true');
    tabLogin.classList.toggle('active', isLogin);
    tabRegister.classList.toggle('active', !isLogin);
    loginForm.style.display = isLogin ? 'block' : 'none';
    registerForm.style.display = isLogin ? 'none' : 'block';
  }
  tabLogin.addEventListener('click', () => activate('login'));
  tabRegister.addEventListener('click', () => activate('register'));
}

function bindAuthForms() {
  $('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errBox = $('loginErr');
    errBox.textContent = '';
    const btn = $('loginBtn');
    btn.disabled = true;
    try {
      await api.post('/customer/login', {
        email: $('loginEmail').value.trim(),
        password: $('loginPassword').value,
      });
      toast('Bienvenida de vuelta.', 'ok');
      await refresh();
    } catch (err) {
      errBox.textContent = (err && err.error) || 'No se pudo iniciar sesión.';
    } finally {
      btn.disabled = false;
    }
  });

  $('registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errBox = $('registerErr');
    errBox.textContent = '';
    const btn = $('registerBtn');
    btn.disabled = true;
    try {
      const payload = {
        name: $('regName').value.trim(),
        email: $('regEmail').value.trim(),
        phone: $('regPhone').value.trim() || undefined,
        password: $('regPassword').value,
        passwordConfirm: $('regPasswordConfirm').value,
      };
      await api.post('/customer/register', payload);
      toast('Cuenta creada. Bienvenida.', 'ok');
      await refresh();
    } catch (err) {
      if (err && err.code === 'VALIDATION' && Array.isArray(err.fields)) {
        errBox.textContent = err.fields.map((f) => f.message).join(' · ');
      } else {
        errBox.textContent = (err && err.error) || 'No se pudo crear la cuenta.';
      }
    } finally {
      btn.disabled = false;
    }
  });
}

/* ---------- App: perfil + mis citas ---------- */

function showApp(me) {
  $('guestPanel').style.display = 'none';
  $('appPanel').style.display = 'block';
  $('whoName').textContent = me.name;
  $('whoEmail').textContent = me.email;
  $('navCuenta').textContent = me.name.split(' ')[0] || 'Mi cuenta';
  $('navCuenta').setAttribute('href', './cuenta.html');
  $('profileName').value = me.name || '';
  $('profileEmail').value = me.email || '';
  $('profilePhone').value = me.phone || '';
  loadMyAppointments();
}

function bindLogout() {
  $('logoutBtn').addEventListener('click', async () => {
    try { await api.post('/customer/logout', {}); } catch { /* ignore */ }
    api.resetCsrf();
    toast('Sesión cerrada.', 'ok');
    showGuest();
    // Limpia formularios sensibles
    $('loginPassword').value = '';
    $('regPassword').value = '';
    $('regPasswordConfirm').value = '';
  });
}

function bindProfile() {
  $('profileForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errBox = $('profileErr');
    errBox.textContent = '';
    const btn = $('profileBtn');
    btn.disabled = true;
    try {
      await api.patch('/customer/profile', {
        name: $('profileName').value.trim(),
        phone: $('profilePhone').value.trim() || undefined,
      });
      toast('Perfil actualizado.', 'ok');
      await refresh();
    } catch (err) {
      errBox.textContent = (err && err.error) || 'No se pudo actualizar el perfil.';
    } finally {
      btn.disabled = false;
    }
  });

  $('passwordForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errBox = $('passwordErr');
    errBox.textContent = '';
    const btn = $('passwordBtn');
    btn.disabled = true;
    try {
      await api.post('/customer/change-password', {
        currentPassword: $('currentPassword').value,
        newPassword: $('newPassword').value,
        newPasswordConfirm: $('newPasswordConfirm').value,
      });
      toast('Contraseña actualizada.', 'ok');
      $('currentPassword').value = '';
      $('newPassword').value = '';
      $('newPasswordConfirm').value = '';
    } catch (err) {
      errBox.textContent = (err && err.error) || 'No se pudo cambiar la contraseña.';
    } finally {
      btn.disabled = false;
    }
  });
}

async function loadMyAppointments() {
  const body = $('myAppointments');
  body.innerHTML = '<div class="center-load"><div class="spinner dark"></div></div>';
  try {
    const res = await api.get('/customer/appointments');
    renderAppointments(res.data || []);
  } catch (err) {
    if (err && err.code && String(err.code).indexOf('SESSION') !== -1) {
      showGuest();
      return;
    }
    body.innerHTML = `<div class="empty">${(err && err.error) || 'No se pudieron cargar tus citas.'}</div>`;
  }
}

function renderAppointments(rows) {
  const body = $('myAppointments');
  body.innerHTML = '';
  if (!rows.length) {
    body.innerHTML = `
      <div class="empty">
        <p>Aún no tienes citas registradas.</p>
        <a class="btn" href="./#reserva" style="margin-top:10px">Reservar mi primera cita</a>
      </div>`;
    return;
  }
  rows.forEach((a) => {
    const card = document.createElement('article');
    card.className = 'appt-card';
    const canCancel = ['pending', 'confirmed'].includes(a.status);
    card.innerHTML = `
      <div class="appt-head">
        <div>
          <div class="appt-date">${formatShortDate(a.date)} · ${escapeText(a.time)}</div>
          <div class="appt-service">${escapeText(a.serviceLabel)}</div>
        </div>
        <span class="badge ${a.status}">${STATUS_LABEL[a.status] || a.status}</span>
      </div>
      <dl class="appt-meta">
        <div><dt>Código</dt><dd>${escapeText(a.reference)}</dd></div>
        <div><dt>Notas</dt><dd>${a.notes ? escapeText(a.notes) : '—'}</dd></div>
      </dl>
      <div class="appt-actions">
        ${canCancel ? `<button class="btn line sm" data-action="cancel" data-id="${a.id}">Cancelar cita</button>` : ''}
        <a class="btn wa sm" href="${businessLink('573136147706', `Hola, te escribo desde mi cuenta sobre mi cita ${a.reference}.`)}" target="_blank" rel="noopener">Escribir por WhatsApp</a>
      </div>
    `;
    body.appendChild(card);
  });
  body.addEventListener('click', onAppointmentClick, { once: true });
}

async function onAppointmentClick(e) {
  const btn = e.target.closest('button[data-action="cancel"]');
  if (!btn) return;
  const id = Number(btn.dataset.id);
  if (!confirm('¿Seguro que quieres cancelar esta cita?')) return;
  btn.disabled = true;
  try {
    await api.post(`/customer/appointments/${id}/cancel`, {});
    toast('Cita cancelada.', 'ok');
    await loadMyAppointments();
  } catch (err) {
    btn.disabled = false;
    toast((err && err.error) || 'No se pudo cancelar la cita.', 'err');
  }
}

function escapeText(s) {
  return String(s == null ? '' : s);
}
