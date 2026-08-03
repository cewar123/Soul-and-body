/**
 * Soul and Body — Cliente de API compartido.
 * Encapsula fetch, cookies de sesión y el token CSRF.
 * @module core/api
 */

// API_BASE se resuelve en runtime para que funcione tanto con el backend
// servidos en el mismo origen como con GitHub Pages + backend en otro host.
function resolveApiBase() {
  // Prioridad:
  // 1) Variable global inyectada por el HTML (`window.SB_API_BASE`).
  // 2) Meta tag `<meta name="api-base" content="...">`.
  // 3) Mismo origen (`${location.origin}/api`).
  if (window.SB_API_BASE) return window.SB_API_BASE;
  const meta = document.querySelector('meta[name="api-base"]');
  if (meta && meta.content) return meta.content;
  return `${window.location.origin}/api`;
}

const BASE = resolveApiBase();
let csrfToken = null;

/** Obtiene (y cachea) un token CSRF del backend. */
async function ensureCsrf() {
  if (csrfToken) return csrfToken;
  const res = await fetch(`${BASE}/csrf-token`, { credentials: 'same-origin' });
  if (!res.ok) throw { ok: false, error: 'No se pudo obtener el token CSRF.', code: 'CSRF_INIT' };
  const data = await res.json();
  csrfToken = data.csrfToken;
  return csrfToken;
}

async function request(method, path, body) {
  const opts = {
    method,
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  };

  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }

  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    opts.headers['x-csrf-token'] = await ensureCsrf();
  }

  let res;
  try {
    res = await fetch(BASE + path, opts);
  } catch {
    throw { ok: false, error: 'No hay conexión con el servidor. Revisa tu internet.', code: 'NETWORK' };
  }

  let data = null;
  try { data = await res.json(); } catch { /* respuesta sin cuerpo */ }

  if (!res.ok) {
    if (res.status === 403 && data && data.code === 'CSRF') csrfToken = null;
    throw data || { ok: false, error: `Error ${res.status}`, code: `HTTP_${res.status}` };
  }
  return data;
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  patch: (path, body) => request('PATCH', path, body),
  del: (path) => request('DELETE', path),
  resetCsrf: () => { csrfToken = null; },
  base: BASE,
};
