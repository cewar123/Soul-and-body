import { env } from 'cloudflare:workers';
import { beforeAll } from 'vitest';
import { applyD1Migrations } from 'cloudflare:test';
import type { D1Migration } from '@cloudflare/vitest-plugin';

declare global {
  // `wrangler types` tipa `import { env } from 'cloudflare:workers'` como
  // Cloudflare.Env, así que ahí es donde se declaran los bindings de test.
  namespace Cloudflare {
    interface Env {
      /** Migraciones leídas de migrations/ por vitest.config.ts. */
      TEST_MIGRATIONS: D1Migration[];
      /** Seeds leídos de seeds/ por vitest.config.ts. */
      TEST_SEED: D1Migration[];
    }
  }
}

/**
 * Prepara la base de datos de los tests.
 *
 * vitest.config.ts usa `isolate: false` + `fileParallelism: false` para que
 * todos los archivos compartan el mismo almacenamiento de workerd, así que el
 * estado de la base sobrevive entre ellos. Por eso:
 *
 *  · las migraciones se aplican una vez (`applyD1Migrations` es idempotente por
 *    número de migración);
 *  · los seeds se vuelven a aplicar en cada archivo, y son idempotentes por
 *    diseño (`ON CONFLICT DO UPDATE`), lo que además los mantiene correctos si
 *    alguien edita el catálogo a mitad de una sesión de tests.
 */
beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);

  for (const group of env.TEST_SEED) {
    for (const statement of group.queries) {
      await env.DB.prepare(statement).run();
    }
  }
});