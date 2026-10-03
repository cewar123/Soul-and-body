import { env } from 'cloudflare:workers';
import { beforeAll } from 'vitest';
import { applyD1Migrations } from 'cloudflare:test';
import type { D1Migration } from '@cloudflare/vitest-plugin';

declare global {
  // `wrangler types` tipa `import { env } from 'cloudflare:workers'` como
  // Cloudflare.Env, así que ahí es donde se declara el binding de test.
  namespace Cloudflare {
    interface Env {
      /** Migraciones leídas de migrations/ por vitest.config.ts. */
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}

/**
 * Aplica las migraciones antes de cada archivo de test.
 *
 * vitest.config.ts usa `isolate: false` + `fileParallelism: false` para que
 * todos los archivos compartan el mismo almacenamiento de workerd, así que el
 * estado de la base sobrevive entre ellos. `applyD1Migrations` es idempotente
 * por número de migración, por eso solo hace falta llamar una vez.
 */
beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});