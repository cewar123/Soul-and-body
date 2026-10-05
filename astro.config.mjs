import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import { loadEnvFile } from 'node:process';

// Astro lee `.env` para `import.meta.env`, pero astro.config.mjs se evalúa en
// Node antes de eso, así que las variables no están en `process.env`. Se carga
// el archivo a mano (función nativa de Node 22). Si no existe, se sigue con lo
// que haya en el entorno — que es como funciona en CI.
try {
  loadEnvFile();
} catch {
  // Sin .env: normal en CI, donde las variables llegan por el entorno.
}

// URL pública. Al cambiar esto cambian a la vez los canonical, el sitemap, los
// datos estructurados y las URLs de las previews.
const site = process.env.PUBLIC_URL ?? 'https://soul-and-body.workers.dev';

// `output: 'server'` es obligatorio para que Astro emita el bundle del Worker.
// Con `output: 'static'` y todas las páginas prerenderizadas no genera ningún
// bundle, y el `src/worker.ts` (que monta la API de Hono) nunca se despliega.
//
// El HTML público sigue siendo estático de verdad: cada página declara
// `export const prerender = true` y sale como asset con cache inmutable. Lo
// único on-demand es /api/*.
export default defineConfig({
  site,
  output: 'server',
  adapter: cloudflare({
    // `cloudflare` usa Image Resizing (gratis en el mismo Worker) sin pedir un
    // binding de pago. Cambiar a 'compile' si alguna vez se rompe en workerd.
    imageService: 'cloudflare',
    // Los prerenderizados corren en workerd, igual que producción.
    prerenderEnvironment: 'workerd',
  }),

  // No usamos el Sessions API de Astro: la sesión del panel es una cookie
  // firmada con HMAC. Esto evita que se aprovisione un namespace de KV.
  session: false,

  // Astro 7 usa reglas JSX de espaciado por defecto, que borran espacios entre
  // elementos inline. Volvemos al comportamiento HTML-aware.
  compressHTML: true,

  build: {
    assets: 'assets',
    inlineStylesheets: 'auto',
  },

  vite: {
    // El sitio es pequeño: minificar menos pesa poco y deja los errores de
    // producción legibles cuando algo falla en `wrangler tail`.
    build: {
      minify: false,
    },
    resolve: {
      alias: {
        '@': new URL('./src', import.meta.url).pathname,
      },
    },
  },
});