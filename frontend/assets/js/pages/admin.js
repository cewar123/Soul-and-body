/**
 * Soul and Body — Lógica del panel de administración.
 */

import { api } from '../core/api.js';
import { toast, trapFocus } from '../core/ui.js';
import { getConfig } from '../core/config.js';
import { formatShortDate } from '../services/slots.js';
import { adminContactLink } from '../services/message.js';

let WHATSAPP = '573136147706';
const STATUS_LABEL = { pending: 'Pendiente', confirmed: 'Confirmada', cancelled: 'Cancelada', completed: 'Completada' };

const $ = (id) => document.getElementById(id);

document.addEventListener('DOMContentLoaded', init);

async function init() {
  bindLogin();
  bindPanel();
  try {
    const me = await api.get('/auth/me');
    showApp(me.data.username);
  } catch {
    showLogin();
  }
}

function bindLogin() {
  $('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('loginBtn');
    const errBox = $('loginErr');
    errBox.textContent = '';
    const username = $('username').value.trim();
    const password = $('password').value;
    if (!username || !password) { errBox.textContent = 'Completa usuario y contraseña.'; return; }

    btn.disabled = true; btn.textContent = 'Ingresando...';
    try {
      const res = await api.post('/auth/login', { username, password });
      $('password').value = '';
      showApp(res.data.username);
    } catch (err) {
      errBox.textContent = (err && err.error) || 'No se pudo iniciar sesión.';
    } finally {
      btn.disabled = false; btn.textContent = 'Ingresar';
    }
  });
}

function showLogin() {
  $('loginScreen').style.display = 'grid';
  $('app').style.display = 'none';
}

async function showApp(username) {
  $('loginScreen').style.display = 'none';
  $('app').style.display = 'block';
  $('whoMini').textContent = username ? `Sesión: ${username}` : '';
  try {
    const c = await getConfig();
    if (c.whatsapp) WHATSAPP = c.whatsapp;
  } catch { /* no bloquear el panel */ }
  await Promise.all([loadStats(), loadList()]);
}

function bindPanel() {
  $('logoutBtn').addEventListener('click', async () => {
    try { await api.post('/auth/logout', {}); } catch { /* ignore */ }
    api.resetCsrf();
    showLogin();
  });
  $('applyFilters').addEventListener('click', loadList);
  $('clearFilters').addEventListener('click', () => {
    $('fStatus').value = ''; $('fDate').value = ''; $('fSearch').value = '';
    loadList();
  });
  $('fSearch').addEventListener('keydown', (e) => { if (e.key === 'Enter') loadList(); });
  $('refreshBtn').addEventListener('click', () => { loadStats(); loadList(); });
  $('modalClose').addEventListener('click', closeModal);
  $('modalBack').addEventListener('click', (e) => { if (e.target === $('modalBack')) closeModal(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('modalBack').classList.contains('open')) closeModal();
  });
}

async function loadStats() {
  try {
    const res = await api.get('/admin/stats');
    $('statToday').textContent = res.data.today;
    $('statUpcoming').textContent = res.data.upcoming;
    $('statPending').textContent = res.data.pending;
    $('statTotal').textContent = res.data.total;
  } catch (e) {
    if (e && e.code && String(e.code).indexOf('SESSION') !== -1) showLogin();
  }
}

function buildQuery() {
  const params = [];
  const status = $('fStatus').value;
  const date = $('fDate').value;
  const q = $('fSearch').value.trim();
  if (status) params.push(`status=${encodeURIComponent(status)}`);
  if (date) params.push(`date=${encodeURIComponent(date)}`);
  if (q) params.push(`q=${encodeURIComponent(q)}`);
  return params.length ? `?${params.join('&')}` : '';
}

async function loadList() {
  const body = $('tableBody');
  body.innerHTML = '<tr><td colspan="6"><div class="center-load"><div class="spinner"></div></div></td></tr>';
  try {
    const res = await api.get(`/admin/appointments${buildQuery()}`);
    renderRows(res.data);
  } catch (e) {
    if (e && e.code && String(e.code).indexOf('SESSION') !== -1) { showLogin(); return; }
    body.innerHTML = '<tr><td colspan="6"><div class="empty">No se pudo cargar la lista.</div></td></tr>';
  }
}

function renderRows(rows) {
  const body = $('tableBody');
  body.innerHTML = '';
  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="6"><div class="empty">No hay citas que coincidan con el filtro.</div></td></tr>';
    return;
  }
  rows.forEach((a) => {
    const tr = document.createElement('tr');

    const tdWhen = document.createElement('td');
    const when = document.createElement('div');
    when.className = 'name'; when.textContent = formatShortDate(a.date);
    const time = document.createElement('div');
    time.className = 'muted'; time.textContent = a.time;
    tdWhen.append(when, time);

    const tdWho = document.createElement('td');
    const nm = document.createElement('div'); nm.className = 'name'; nm.textContent = a.name;
    const ref = document.createElement('div'); ref.className = 'ref'; ref.textContent = a.reference;
    tdWho.append(nm, ref);

    const tdSvc = document.createElement('td'); tdSvc.textContent = a.serviceLabel;

    const tdContact = document.createElement('td');
    const ph = document.createElement('div'); ph.textContent = a.phone;
    tdContact.append(ph);
    if (a.email) { const em = document.createElement('div'); em.className = 'muted'; em.textContent = a.email; tdContact.append(em); }

    const tdStatus = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = `badge ${a.status}`; badge.textContent = STATUS_LABEL[a.status] || a.status;
    tdStatus.append(badge);

    const tdActions = document.createElement('td');
    tdActions.append(buildActions(a));

    tr.append(tdWhen, tdWho, tdSvc, tdContact, tdStatus, tdActions);
    tr.addEventListener('click', (e) => { if (e.target.tagName !== 'BUTTON' && e.target.tagName !== 'A') openModal(a); });
    body.append(tr);
  });
}

function buildActions(a) {
  const box = document.createElement('div');
  box.className = 'actions-cell';

  function actionBtn(label, cls, status) {
    const b = document.createElement('button');
    b.className = `btn sm ${cls}`; b.textContent = label;
    b.addEventListener('click', (ev) => { ev.stopPropagation(); changeStatus(a.id, status); });
    return b;
  }

  if (a.status === 'pending') {
    box.append(actionBtn('Confirmar', 'ok', 'confirmed'));
    box.append(actionBtn('Cancelar', 'danger', 'cancelled'));
  } else if (a.status === 'confirmed') {
    box.append(actionBtn('Completar', 'ghost', 'completed'));
    box.append(actionBtn('Cancelar', 'danger', 'cancelled'));
  } else if (a.status === 'cancelled') {
    box.append(actionBtn('Reactivar', 'ghost', 'pending'));
  }

  const wa = document.createElement('a');
  wa.className = 'btn sm wa'; wa.textContent = 'WhatsApp';
  wa.href = adminContactLink(a);
  wa.target = '_blank'; wa.rel = 'noopener';
  wa.addEventListener('click', (ev) => ev.stopPropagation());
  box.append(wa);

  return box;
}

async function changeStatus(id, status) {
  try {
    await api.patch(`/admin/appointments/${id}/status`, { status });
    toast('Cita actualizada.', 'ok');
    await Promise.all([loadStats(), loadList()]);
  } catch (e) {
    if (e && e.code && String(e.code).indexOf('SESSION') !== -1) { showLogin(); return; }
    toast((e && e.error) || 'No se pudo actualizar.', 'err');
  }
}

let releaseFocus = null;
function openModal(a) {
  const rows = [
    ['Código', a.reference],
    ['Estado', STATUS_LABEL[a.status] || a.status],
    ['Nombre', a.name],
    ['Servicio', a.serviceLabel],
    ['Fecha', formatShortDate(a.date)],
    ['Hora', a.time],
    ['Teléfono', a.phone],
    ['Correo', a.email || '—'],
    ['Notas', a.notes || '—'],
    ['Creada', (a.created_at || '').replace('T', ' ')],
  ];
  const box = $('modalBody');
  box.innerHTML = '';
  rows.forEach((r) => {
    const row = document.createElement('div'); row.className = 'row';
    const k = document.createElement('span'); k.className = 'k'; k.textContent = r[0];
    const v = document.createElement('span'); v.className = 'v'; v.textContent = r[1];
    row.append(k, v); box.append(row);
  });
  $('modalBack').classList.add('open');
  releaseFocus = trapFocus($('modalBack'));
}

function closeModal() {
  $('modalBack').classList.remove('open');
  if (releaseFocus) { releaseFocus(); releaseFocus = null; }
}
