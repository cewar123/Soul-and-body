import { exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

/**
 * Pruebas de extremo a extremo del router de la API.
 *
 * Se hace fetch() al entrypoint real del worker de pruebas (vitest.config.ts lo
 * apunta a src/server/app.ts) en vez de importar el router a mano: así se
 * ejercita exactamente el export por defecto que se despliega.
 *
 * El worker completo `cf() + api + astro()` se valida con `npm run build`.
 */
const workerEntry = exports.default;
// Hono resuelve las rutas usando `this`, así que hay que conservar el binding.
const worker = workerEntry.fetch.bind(workerEntry);

interface HealthResponse {
  ok: boolean;
  service: string;
  requestId: string;
}

interface ErrorResponse {
  error: string;
}

describe('GET /api/health', () => {
  it('responde 200 con el estado del servicio', async () => {
    const res = await worker(new Request('https://soul-and-body.test/api/health'));

    expect(res.status).toBe(200);
    const body = (await res.json()) as HealthResponse;
    expect(body.ok).toBe(true);
    expect(body.service).toBe('soul-and-body');
    expect(body.requestId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('asigna un requestId distinto a cada petición', async () => {
    const [a, b] = await Promise.all([
      worker(new Request('https://soul-and-body.test/api/health')),
      worker(new Request('https://soul-and-body.test/api/health')),
    ]);
    const bodyA = (await a.json()) as HealthResponse;
    const bodyB = (await b.json()) as HealthResponse;
    expect(bodyA.requestId).not.toBe(bodyB.requestId);
  });

  it('no expone cabeceras CORS', async () => {
    const res = await worker(
      new Request('https://soul-and-body.test/api/health', {
        headers: { Origin: 'https://sitio-malicioso.example' },
      }),
    );
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});

describe('rutas /api inexistentes', () => {
  it('devuelve 404 en JSON, no HTML', async () => {
    const res = await worker(new Request('https://soul-and-body.test/api/no-existe'));

    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toContain('application/json');

    const body = (await res.json()) as ErrorResponse;
    expect(body.error).toBe('not_found');
  });
});