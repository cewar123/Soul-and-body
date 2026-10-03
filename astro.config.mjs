import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

// URL pública. Se sobreescribe con la variable de entorno PUBLIC_URL (o .env)
// para no tener que editar el código cuando haya dominio propio.
const site = process.env.PUBLIC_URL ?? 'https://soul-and-body.workers.dev';

// `output: 'static'` prerenderiza todo el HTML público en el build. Lo único
// dinámico es /api/*, que lo resuelve el router de Hono montado en src/worker.ts
// ANTES de que Astro atienda el request. Un solo Worker, un solo origen, sin CORS.
export default defineConfig({
  site,
  output: 'static',
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