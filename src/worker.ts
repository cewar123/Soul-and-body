import { Hono } from 'hono';
import { astro } from 'astro/hono';
import { cf } from '@astrojs/cloudflare/hono';
import { api } from './server/app.ts';

/**
 * Entry point del Worker (lo apunta `main` en wrangler.jsonc).
 *
 * Orden de la cadena. `cf()` envuelve todo: sirve los estáticos desde el
 * binding ASSETS y, si el request llega hasta el final, aplica las cookies y
 * las cabeceras de caché de Cloudflare.
 *
 * `astro()` va SIEMPRE de último porque es terminal: nunca llama a `next()`,
 * así que cualquier middleware registrado después quedaría muerto y jamás se
 * ejecutaría. Entre ambos vive nuestra API de Hono.
 *
 * Nota de tests: los tests de vitest usan `src/server/app.ts` como entrypoint
 * en lugar de este archivo, porque `astro/hono` importa `virtual:astro:app`, un
 * módulo virtual que solo existe durante el build de Astro. Este archivo se
 * verifica con `npm run build`.
 */
const app = new Hono<{ Bindings: Env }>();

app.use(cf());

// /api/* se resuelve aquí y nunca llega a Astro.
app.route('/', api);

app.use(astro());

export default app;