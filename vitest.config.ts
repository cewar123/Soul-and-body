import { defineConfig } from 'vitest/config';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import path from 'node:path';

// Corre los tests dentro del runtime real de Workers (workerd), no en Node.
// Es lo que garantiza que lo que pasa en los tests pasa en producción: mismas
// APIs, mismo D1, mismo `crypto`.
export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      wrangler: { configPath: './wrangler.jsonc' },
      // Entry point SOLO para tests: la API sin el remate de Astro.
      //
      // `src/worker.ts` importa `astro/hono`, que entra a `virtual:astro:app`,
      // un módulo virtual que solo existe durante el build de Astro y por eso
      // no se puede resolver en vitest. Como un Hono app ya implementa
      // `{ fetch(request, env, ctx) }`, apuntamos el worker de pruebas al router
      // de la API: los tests ejercitan el mismo código que se despliega, y la
      // composición `cf() + api + astro()` la valida `npm run build`.
      main: './src/server/app.ts',
      miniflare: {
        bindings: {
          // Migraciones cargadas desde migrations/ y aplicadas en beforeAll.
          TEST_MIGRATIONS: await readD1Migrations(path.join(import.meta.dirname, 'migrations')),
          // Seeds de seeds/: mismo catálogo y ajustes que producción.
          TEST_SEED: await readD1Migrations(path.join(import.meta.dirname, 'seeds')),
        },
      },
    })),
  ],

  test: {
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts'],
    // Storage de workerd está aislado por archivo de test. Estos tests comparten
    // estado (migraciones + fixtures), así que corren en un solo hilo y sin
    // aislamiento para que vean la misma base.
    fileParallelism: false,
    isolate: false,
    reporters: ['default'],
    coverage: {
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts'],
    },
  },
});