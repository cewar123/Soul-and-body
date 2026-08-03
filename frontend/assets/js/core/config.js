/**
 * Soul and Body — Caché de la configuración pública del backend.
 * Carga /api/config una vez y la comparte entre páginas.
 * @module core/config
 */

import { api } from './api.js';

let cache = null;
let pending = null;

export async function getConfig() {
  if (cache) return cache;
  if (pending) return pending;
  pending = api.get('/config').then((res) => {
    cache = res.data;
    return cache;
  });
  return pending;
}
