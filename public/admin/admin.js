/*
 * Panel de administración — JavaScript nativo, sin dependencias.
 *
 * El servidor es la autoridad: cada cambio se guarda por la API y la UI solo
 * refleja lo que vuelve. No hay estado optimista porque un error a medio camino
 * en un panel de citas es peor que un segundo de espera.
 */
(() => {
  'use strict';

  const $ = (sel, scope = document) => scope.querySelector(sel);
  const $$ = (sel, scope = document) => [...scope.querySelectorAll(sel)];

  const STATUS_LABELS = {
    pending: 'Pendiente',
    confirmed: 'Confirmada',
    completed: 'Completada',
    cancelled: 'Cancelada',
    no_show: 'No se presentó',
  };

  const DAY_LABELS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

  const state = {
    user: null,
    date: todayLocal(),
    status: '',
    query: '',
    services: [],
    blocked: [],
    schedule: {},
  };

  /** Fecha local de Colombia (UTC-5 fijo), no la del navegador. */
  function todayLocal() {
    const d = new Date(Date.now() - 5 * 3600 * 1000);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  }

  function shiftDate(date, days) {
    const [y, m, d] = date.split('-').map(Number);
    const next = new Date(Date.UTC(y, m - 1, d + days));
    return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
  }

  function prettyDate(date) {
    const [y, m, d] = date.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('es-CO', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      timeZone: 'UTC',
    });
  }

  function formatMoney(cop) {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0,
    }).format(cop);
  }

  function whatsappLink(phone, text) {
    return `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;
  }

  function toast(message, isError = false) {
    const el = document.createElement('div');
    el.className = `toast${isError ? ' toast--error' : ''}`;
    el.textContent = message;
    document.body.append(el);
    setTimeout(() => el.remove(), 4000);
  }

  function showError(el, message) {
    if (!el) return;
    el.textContent = message;
    el.hidden = false;
    setTimeout(() => {
      el.hidden = true;
    }, 7000);
  }

  // ── API ─────────────────────────────────────────────────────────────────

  async function api(path, options = {}) {
    const res = await fetch(path, {
      ...options,
      headers: {
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
    });

    if (res.status === 401) {
      // La sesión expiró o no había: se vuelve al login sin avisar.
      showLogin();
      throw new Error('no_session');
    }

    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const first = Object.values(body.fields ?? {})[0];
      throw Object.assign(new Error(first ?? body.message ?? 'Error inesperado.'), {
        code: body.error,
      });
    }
    return body;
  }

  // ── Arranque ────────────────────────────────────────────────────────────

  async function boot() {
    $('#login-form').addEventListener('submit', onLogin);
    $('#logout').addEventListener('click', onLogout);

    try {
      const me = await api('/api/admin/me');
      showApp(me.username);
      await Promise.all([loadStats(), loadAppointments(), loadServices(), loadBlocked()]);
    } catch {
      showLogin();
    }
  }

  function showLogin() {
    state.user = null;
    $('#app').hidden = true;
    $('#login').hidden = false;
    $('#login-form').username?.focus();
  }

  function showApp(username) {
    state.user = username;
    $('#login').hidden = true;
    $('#app').hidden = false;
    $('#who').textContent = username;
  }

  async function onLogin(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const error = $('#login-error');
    error.hidden = true;
    $('#login-submit').disabled = true;

    try {
      const result = await api('/api/admin/login', {
        method: 'POST',
        body: JSON.stringify({
          username: form.username.value,
          password: form.password.value,
        }),
      });
      form.reset();
      showApp(result.username);
      await Promise.all([loadStats(), loadAppointments(), loadServices(), loadBlocked()]);
    } catch (err) {
      if (err.message !== 'no_session') showError(error, err.message);
    } finally {
      $('#login-submit').disabled = false;
    }
  }

  async function onLogout() {
    try {
      await api('/api/admin/logout', { method: 'POST' });
    } catch {
      /* la cookie se limpia igual */
    }
    showLogin();
  }

  // ── Métricas ────────────────────────────────────────────────────────────

  async function loadStats() {
    const stats = await api('/api/admin/stats');
    const cards = [
      { value: stats.todayActive, label: 'Citas hoy' },
      { value: stats.weekActive, label: 'Próximos 7 días' },
      { value: stats.pending, label: 'Sin confirmar', alert: true },
    ];
    $('#stats').innerHTML = cards
      .map(
        (c) =>
          `<div class="stat${c.alert ? ' stat--alert' : ''}">
             <span class="stat__value">${c.value}</span>
             <span class="stat__label">${c.label}</span>
           </div>`,
      )
      .join('');
  }

  // ── Agenda ──────────────────────────────────────────────────────────────

  function bindAgenda() {
    $('#filter-date').value = state.date;
    $('#prev-day').addEventListener('click', () => {
      state.date = shiftDate(state.date, -1);
      $('#filter-date').value = state.date;
      void loadAppointments();
    });
    $('#next-day').addEventListener('click', () => {
      state.date = shiftDate(state.date, 1);
      $('#filter-date').value = state.date;
      void loadAppointments();
    });
    $('#today').addEventListener('click', () => {
      state.date = todayLocal();
      $('#filter-date').value = state.date;
      void loadAppointments();
    });
    $('#filter-date').addEventListener('change', (e) => {
      state.date = e.target.value;
      void loadAppointments();
    });
    $('#filter-status').addEventListener('change', (e) => {
      state.status = e.target.value;
      void loadAppointments();
    });

    let debounce;
    $('#filter-q').addEventListener('input', (e) => {
      clearTimeout(debounce);
      state.query = e.target.value.trim();
      debounce = setTimeout(() => void loadAppointments(), 300);
    });
  }

  async function loadAppointments() {
    const params = new URLSearchParams();
    // Sin filtros de estado ni búsqueda se ve el día; con ellos, una lista
    // global que es lo que se espera al buscar.
    if (state.status || state.query) {
      if (state.status) params.set('status', state.status);
      if (state.query) params.set('q', state.query);
      params.set('limit', '100');
    } else {
      params.set('date', state.date);
    }
    params.set('service', '1'); // el endpoint público exige service; se ignora aquí

    // El listado del panel usa su propio endpoint.
    const res = await api(`/api/admin/appointments?${params}`);
    const list = res.appointments;

    const byDay = state.status || state.query;
    $('#day-view').hidden = !!byDay;
    $('#list-view').hidden = !byDay;

    if (byDay) renderList(list);
    else renderDay(list);

    void loadStats();
  }

  function renderDay(appointments) {
    const host = $('#day-view');
    const title = `<h3 class="view__head"><h2 style="margin:0;font-size:1.15rem">${prettyDate(state.date)}</h2></h3>`;

    if (appointments.length === 0) {
      host.innerHTML = title + `<p class="empty">Sin citas para este día.</p>`;
      return;
    }

    host.innerHTML =
      title +
      `<div class="agenda">${appointments
        .map(
          (a) => `
        <article class="slot-row slot-row--${a.status}">
          <span class="slot-row__time">${a.time}</span>
          <div class="slot-row__main">
            <span class="slot-row__name">${escapeHtml(a.clientName)}</span>
            <span class="tag tag--${a.status}">${STATUS_LABELS[a.status] ?? a.status}</span>
            <span class="slot-row__meta">${escapeHtml(a.serviceName)} · ${a.durationMin} min · ${escapeHtml(a.reference)}</span>
            ${a.clientNotes ? `<span class="slot-row__meta">“${escapeHtml(a.clientNotes)}”</span>` : ''}
            <div class="slot-row__actions">
              <a class="btn btn--sm" target="_blank" rel="noopener"
                 href="${whatsappLink(a.clientPhone, `Hola ${a.clientName}, te escribo de ${state.brand ?? 'Soul and Body'} por tu cita ${a.reference}.`)}">WhatsApp</a>
              ${nextActions(a)}
            </div>
          </div>
        </article>`,
        )
        .join('')}</div>`;

    bindRowActions(host);
  }

  function renderList(appointments) {
    if (appointments.length === 0) {
      $('#list-view').innerHTML = `<p class="empty">Ningún resultado.</p>`;
      return;
    }

    $('#list-view').innerHTML = `
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>Fecha</th><th>Hora</th><th>Clienta</th><th>Servicio</th><th>Estado</th><th>Código</th><th>Acciones</th></tr>
          </thead>
          <tbody>
            ${appointments
              .map(
                (a) => `
              <tr>
                <td>${a.date}</td>
                <td class="num">${a.time}</td>
                <td>${escapeHtml(a.clientName)}<br><span class="slot-row__meta">${escapeHtml(a.clientPhone)}</span></td>
                <td>${escapeHtml(a.serviceName)}</td>
                <td><span class="tag tag--${a.status}">${STATUS_LABELS[a.status] ?? a.status}</span></td>
                <td class="num">${escapeHtml(a.reference)}</td>
                <td><div class="row-actions">${nextActions(a)}</div></td>
              </tr>`,
              )
              .join('')}
          </tbody>
        </table>
      </div>`;

    bindRowActions($('#list-view'));
  }

  function nextActions(a) {
    const button = (status, label, extra = '') =>
      `<button class="btn btn--sm" type="button" data-status="${status}" data-id="${a.id}" ${extra}>${label}</button>`;

    const buttons = [];
    if (a.status === 'pending') buttons.push(button('confirmed', 'Confirmar'));
    if (a.status === 'pending' || a.status === 'confirmed') {
      buttons.push(button('completed', 'Completada'));
      buttons.push(button('cancelled', 'Cancelada', 'data-danger="1"'));
      buttons.push(button('no_show', 'No se presentó'));
    }
    if (a.status === 'cancelled' || a.status === 'no_show') {
      buttons.push(button('confirmed', 'Reactivar'));
    }
    return buttons.join('');
  }

  function bindRowActions(scope) {
    $$('[data-status]', scope).forEach((button) => {
      button.addEventListener('click', async () => {
        const { id, status } = button.dataset;
        if (status === 'cancelled' && !confirm('¿Cancelar esta cita? Se libera el horario.')) {
          return;
        }

        button.disabled = true;
        try {
          await api(`/api/admin/appointments/${id}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ status }),
          });
          toast('Cita actualizada');
          await Promise.all([loadAppointments(), loadStats()]);
        } catch (error) {
          toast(error.message, true);
          button.disabled = false;
        }
      });
    });
  }

  // ── Servicios ───────────────────────────────────────────────────────────

  async function loadServices() {
    const { services } = await api('/api/admin/services');
    state.services = services;

    $('#services-list').innerHTML = `
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>Nombre</th><th>Identificador</th><th>Duración</th><th>Precio</th><th>Visible</th><th>Orden</th><th></th></tr>
          </thead>
          <tbody>
            ${services
              .map(
                (s) => `
              <tr data-service="${s.id}">
                <td><input class="inline-input" data-f="name" value="${escapeAttr(s.name)}" /></td>
                <td><input class="inline-input" data-f="slug" value="${escapeAttr(s.slug)}" /></td>
                <td><input class="inline-input" data-f="durationMin" type="number" min="15" max="480" step="15" value="${s.durationMin}" /></td>
                <td><input class="inline-input inline-input--price" data-f="priceCop" type="number" min="0" step="1000" value="${s.priceCop}" /></td>
                <td>
                  <label class="switch">
                    <input type="checkbox" data-f="active" ${s.active ? 'checked' : ''} />
                    ${s.active ? 'Sí' : 'No'}
                  </label>
                </td>
                <td><input class="inline-input" data-f="sortOrder" type="number" min="0" value="${s.sortOrder}" /></td>
                <td>
                  <div class="row-actions">
                    <button class="btn btn--sm" type="button" data-save>Guardar</button>
                    <button class="btn btn--sm btn--danger" type="button" data-del title="Borrar o desactivar">✕</button>
                  </div>
                </td>
              </tr>`,
              )
              .join('')}
          </tbody>
        </table>
      </div>`;

    $$('[data-service]').forEach((row) => {
      const id = row.dataset.service;

      $('[data-save]', row).addEventListener('click', async () => {
        const payload = readRow(row);
        const button = $('[data-save]', row);
        button.disabled = true;
        try {
          await api(`/api/admin/services/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(payload),
          });
          toast('Servicio guardado');
          void loadServices();
        } catch (error) {
          toast(error.message, true);
        } finally {
          button.disabled = false;
        }
      });

      $('[data-del]', row).addEventListener('click', async () => {
        if (!confirm('¿Borrar este servicio?\n\nSi ya tiene citas registradas se desactivará en lugar de borrarse, para no perder el historial.')) {
          return;
        }
        try {
          const result = await api(`/api/admin/services/${id}`, { method: 'DELETE' });
          toast(result.message ?? 'Servicio eliminado');
          void loadServices();
        } catch (error) {
          toast(error.message, true);
        }
      });
    });
  }

  function readRow(row) {
    const get = (field) => $(`[data-f="${field}"]`, row);
    return {
      name: get('name').value.trim(),
      slug: get('slug').value.trim(),
      durationMin: Number(get('durationMin').value),
      priceCop: Number(get('priceCop').value),
      active: get('active').checked,
      sortOrder: Number(get('sortOrder').value),
    };
  }

  function bindServiceCreate() {
    $('#service-create').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const body = Object.fromEntries(new FormData(form));
      body.durationMin = Number(body.durationMin);
      body.priceCop = Number(body.priceCop);

      try {
        await api('/api/admin/services', { method: 'POST', body: JSON.stringify(body) });
        form.reset();
        toast('Servicio creado');
        void loadServices();
      } catch (error) {
        toast(error.message, true);
      }
    });
  }

  // ── Fechas bloqueadas ────────────────────────────────────────────────────

  async function loadBlocked() {
    const { dates } = await api('/api/admin/blocked-dates');
    state.blocked = dates;

    if (dates.length === 0) {
      $('#blocked-list').innerHTML = `<p class="empty">No hay fechas bloqueadas.</p>`;
      return;
    }

    $('#blocked-list').innerHTML = `
      <div class="table-wrap">
        <table>
          <thead><tr><th>Fecha</th><th>Motivo</th><th></th></tr></thead>
          <tbody>
            ${dates
              .map(
                (d) => `
              <tr>
                <td class="num">${d.date}</td>
                <td>${escapeHtml(d.reason) || '<span class="slot-row__meta">—</span>'}</td>
                <td><button class="btn btn--sm" type="button" data-unblock="${d.date}">Desbloquear</button></td>
              </tr>`,
              )
              .join('')}
          </tbody>
        </table>
      </div>`;

    $$('[data-unblock]').forEach((button) => {
      button.addEventListener('click', async () => {
        try {
          await api(`/api/admin/blocked-dates/${button.dataset.unblock}`, { method: 'DELETE' });
          toast('Fecha desbloqueada');
          void loadBlocked();
        } catch (error) {
          toast(error.message, true);
        }
      });
    });
  }

  function bindBlockCreate() {
    $('#block-create').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const body = Object.fromEntries(new FormData(form));
      try {
        await api('/api/admin/blocked-dates', { method: 'POST', body: JSON.stringify(body) });
        form.reset();
        toast('Fecha bloqueada');
        void loadBlocked();
      } catch (error) {
        toast(error.message, true);
      }
    });
  }

  // ── Ajustes ─────────────────────────────────────────────────────────────

  async function loadSettings() {
    const data = await api('/api/admin/settings');
    state.schedule = data.schedule;

    const form = $('#settings-form');
    Object.entries(data.settings).forEach(([key, value]) => {
      const input = form.elements.namedItem(key);
      if (input) input.value = value;
    });

    renderSchedule(data.schedule);
  }

  function renderSchedule(schedule) {
    $('#schedule').innerHTML = DAY_LABELS.map((label, day) => {
      const window = schedule[String(day)];
      const open = window?.open ?? '';
      const close = window?.close ?? '';

      return `
        <div class="schedule__row${window ? '' : ' is-closed'}" data-day="${day}">
          <span class="schedule__day">${label}</span>
          <label class="switch">
            <input type="checkbox" data-open ${window ? 'checked' : ''} /> Abierto
          </label>
          <input type="time" data-from value="${open}" ${window ? '' : 'disabled'} />
          <input type="time" data-to value="${close}" ${window ? '' : 'disabled'} />
        </div>`;
    }).join('');

    $$('.schedule__row').forEach((row) => {
      const open = $('[data-open]', row);
      const from = $('[data-from]', row);
      const to = $('[data-to]', row);

      open.addEventListener('change', () => {
        from.disabled = !open.checked;
        to.disabled = !open.checked;
        row.classList.toggle('is-closed', !open.checked);
      });
    });
  }

  function readSchedule() {
    const schedule = {};
    $$('.schedule__row').forEach((row) => {
      const day = row.dataset.day;
      if ($('[data-open]', row).checked) {
        schedule[day] = { open: $('[data-from]', row).value, close: $('[data-to]', row).value };
      } else {
        schedule[day] = null;
      }
    });
    return schedule;
  }

  function bindSettings() {
    $('#settings-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const payload = Object.fromEntries(new FormData(form));
      payload.schedule = JSON.stringify(readSchedule());

      try {
        await api('/api/admin/settings', { method: 'PUT', body: JSON.stringify(payload) });
        toast('Ajustes guardados');
        await Promise.all([loadSettings(), loadStats()]);
      } catch (error) {
        toast(error.message, true);
      }
    });

    $('#password-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const body = Object.fromEntries(new FormData(form));
      try {
        await api('/api/admin/change-password', { method: 'POST', body: JSON.stringify(body) });
        form.reset();
        toast('Contraseña cambiada');
      } catch (error) {
        toast(error.message, true);
      }
    });
  }

  // ── Pestañas ────────────────────────────────────────────────────────────

  function bindTabs() {
    $$('.tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        $$('.tab').forEach((t) => t.classList.toggle('is-active', t === tab));
        const name = tab.dataset.tab;
        $$('.view').forEach((view) => {
          view.hidden = view.dataset.view !== name;
        });

        if (name === 'fechas') void loadBlocked();
        if (name === 'ajustes') void loadSettings();
        if (name === 'servicios') void loadServices();
      });
    });
  }

  // ── Escapado ────────────────────────────────────────────────────────────

  /**
   * Todo lo que viene de la base pasa por aquí antes de tocar innerHTML.
   * El nombre, las notas y el motivo de bloqueo los escribe una clienta, así
   * que sin esto sería un XSS guardado.
   */
  function escapeHtml(value) {
    return String(value ?? '').replace(
      /[&<>"']/g,
      (char) =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
    );
  }

  const escapeAttr = escapeHtml;

  // ── Init ─────────────────────────────────────────────────────────────────

  bindTabs();
  bindAgenda();
  bindServiceCreate();
  bindBlockCreate();
  bindSettings();
  void boot();
})();