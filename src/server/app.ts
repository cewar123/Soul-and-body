import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { publicRoutes } from './routes/public.ts';
import { adminRoutes } from './routes/admin.ts';
import type { AdminSession } from './lib/session.ts';

/**
 * Router de la API.
 *
 * Se monta en src/worker.ts (`app.route('/', api)`) antes de que Astro
 * atienda el request, así que todo lo que llegue a /api lo resuelve Hono. Mismo
 * origen que el sitio: sin CORS y con cookies de sesión que funcionan sin
 * `SameSite=None`.
 *
 * Las rutas declaran su ruta COMPLETA (`/api/...`) y no un prefijo aparte. Así
 * el mismo router sirve en producción y en los tests, sin duplicar la lógica
 * de montaje en dos sitios distintos.
 *
 * Nota deliberada: NO se registra middleware de CORS. La API es de un solo
 * origen y, sin cabeceras `Access-Control-Allow-*`, el navegador impide que
 * cualquier otro sitio la lea o la llame con credenciales. Añadirlo solo abriría
 * la puerta.
 */

/** Variables de entorno ligadas a un entorno concreto (wrangler.jsonc). */
export type Bindings = Env;

export interface AppEnv {
  Bindings: Bindings;
  Variables: {
    /** Se asigna en el primer middleware; sirve para correlacionar logs. */
    requestId: string;
    /** La rellena `requireAdmin`. Solo existe en rutas autenticadas. */
    admin: AdminSession;
  };
}

export const api = new Hono<AppEnv>();

api.use('*', async (c, next) => {
  c.set('requestId', crypto.randomUUID());
  await next();
});

api.get('/api/health', (c) =>
  c.json({
    ok: true,
    service: 'soul-and-body',
    time: new Date().toISOString(),
    requestId: c.get('requestId'),
  }),
);

// Rutas públicas: catálogo, disponibilidad y creación de citas.
api.route('/', publicRoutes);

// Panel de administración. Cada ruta comprueba la sesión en su middleware.
api.route('/', adminRoutes);

// Cualquier ruta /api que no exista devuelve JSON, no el HTML del 404 de Astro.
api.notFound((c) => c.json({ error: 'not_found', message: 'Ese recurso no existe.' }, 404));

api.onError((error, c) => {
  if (error instanceof HTTPException) {
    const status = error.status as 400;
    return c.json({ error: 'http_error', message: error.message || 'Error en la solicitud.' }, status);
  }
  // Nunca se filtra el stack al cliente: se registra y se responde genérico.
  console.error('[api] error no controlado', c.get('requestId'), error);
  return c.json(
    { error: 'internal', message: 'Ocurrió un problema. Intenta de nuevo en un momento.' },
    500,
  );
});

/**
 * Un Hono app implementa `{ fetch(request, env, ctx) }`, así que sirve como
 * entrypoint de módulo de Cloudflare. Los tests usan ESTE export (vía
 * `exports.default.fetch`) para probar exactamente lo que se despliega.
 */
export default api;