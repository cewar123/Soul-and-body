/**
 * Soul and Body — Utilidades de interfaz compartidas.
 * @module core/ui
 */

let wrap = null;

function ensureWrap() {
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.className = 'toast-wrap';
    wrap.setAttribute('role', 'status');
    wrap.setAttribute('aria-live', 'polite');
    document.body.appendChild(wrap);
  }
  return wrap;
}

/** Muestra una notificación efímera. */
export function toast(message, type, ms) {
  const el = document.createElement('div');
  el.className = 'toast' + (type ? ` ${type}` : '');
  el.textContent = message; // textContent => nunca interpreta HTML (anti-XSS)
  ensureWrap().appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .3s';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 300);
  }, ms || 4200);
}

/** Escapa texto para insertarlo con seguridad si se usara innerHTML. */
export function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str == null ? '' : String(str);
  return d.innerHTML;
}

/**
 * Atrapa el foco dentro de un elemento (modal) hasta que se llama a release().
 * Devuelve una función para liberar el foco y restaurarlo al elemento previo.
 */
export function trapFocus(container) {
  const previouslyFocused = document.activeElement;
  const focusable = container.querySelectorAll(
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  );
  if (focusable.length === 0) return () => {};
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  first.focus();

  function onKey(e) {
    if (e.key !== 'Tab') return;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
  container.addEventListener('keydown', onKey);

  return function release() {
    container.removeEventListener('keydown', onKey);
    if (previouslyFocused && previouslyFocused.focus) previouslyFocused.focus();
  };
}
