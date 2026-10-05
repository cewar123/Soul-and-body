/**
 * Rate limiting sobre la tabla `rate_limits`.
 *
 * Por qué en D1 y no en memoria: cada request en Cloudflare puede caer en un
 * isolate distinto, así que un contador en memoria sería inútil — dos personas
 * desde la misma IP pasarían el límite sin problema.
 *
 * Algoritmo: ventana fija. No es el más elegante (permite el doble de tráfico
 * justo en la frontera de la ventana) pero es O(1), no necesita locking y para
 * abuse a escala humana es más que suficiente.
 */

export interface RateLimitOptions {
  /** Identificador de la regla, p.ej. 'booking' o 'login'. */
  name: string;
  /** Ventana en segundos. */
  windowSeconds: number;
  /** Peticiones permitidas por ventana. */
  max: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Peticiones que quedan en la ventana actual. */
  remaining: number;
  /** Segundos hasta que se libere la ventana. */
  retryAfter: number;
}

/** Contadores locales, por isolate. Evita ir a D1 en cada request. */
const counters = new Map<string, { count: number; expiresAt: number }>();

/** Techo de claves en cache antes de empezar a purgar caducadas. */
const MAX_CACHE_KEYS = 5000;

/**
 * Ventana fija, en dos pasos dentro de un batch:
 *
 *   1. INSERT … ON CONFLICT DO UPDATE SET count = count + 1
 *   2. SELECT count
 *
 * El batch los hace atómicos y en orden, así que el SELECT ve el incremento.
 * No se usa `RETURNING` porque D1 no devuelve filas en un upsert, y eso hacía
 * que el contador se quedara siempre en 1: nadie quedaba bloqueado nunca.
 */
export async function consumeRateLimit(
  db: D1Database,
  key: string,
  options: RateLimitOptions,
  now: Date = new Date(),
): Promise<RateLimitResult> {
  const nowMs = now.getTime();
  const windowMs = options.windowSeconds * 1000;
  // Inicio de la ventana actual, alineado a la rejilla.
  const windowStart = Math.floor(nowMs / windowMs) * windowMs;
  const bucket = `${options.name}:${key}`;
  const cacheKey = `${bucket}:${windowStart}`;
  const retryAfter = Math.ceil((windowStart + windowMs - nowMs) / 1000);

  const respond = (count: number): RateLimitResult => ({
    allowed: count <= options.max,
    remaining: Math.max(0, options.max - count),
    retryAfter,
  });

  // Camino rápido: ya contamos esto en este isolate, no vamos a D1.
  const cached = counters.get(cacheKey);
  if (cached && cached.expiresAt > nowMs) {
    cached.count += 1;
    return respond(cached.count);
  }

  const [, read] = await db.batch([
    db
      .prepare(
        `INSERT INTO rate_limits (bucket, window_start, count) VALUES (?, ?, 1)
           ON CONFLICT (bucket, window_start) DO UPDATE SET count = count + 1`,
      )
      .bind(bucket, windowStart),
    db
      .prepare('SELECT count FROM rate_limits WHERE bucket = ? AND window_start = ?')
      .bind(bucket, windowStart),
  ]);

  // `db.batch()` devuelve un resultado por sentencia y el SELECT ve el
  // incremento porque van en el mismo lote. Los tipos de D1 marcan el segundo
  // como opcional aunque con dos sentencias el índice 1 siempre existe.
  const row = read?.results[0] as { count?: number } | undefined;
  const count = row?.count ?? 1;

  // Cache acotada: si la ventana caducó ya no sirve, así que se descarta al
  // insertar. Evita que el Map crezca sin límite entre peticiones.
  if (counters.size > MAX_CACHE_KEYS) {
    for (const [k, entry] of counters) {
      if (entry.expiresAt <= nowMs) counters.delete(k);
    }
  }
  counters.set(cacheKey, { count, expiresAt: windowStart + windowMs });

  // Limpieza barata y esporádica de ventanas viejas en la base.
  if (Math.random() < 0.01) {
    void db
      .prepare('DELETE FROM rate_limits WHERE window_start < ?')
      .bind(nowMs - windowMs * 2)
      .run();
  }

  return respond(count);
}

/**
 * IP real del visitante.
 *
 * `CF-Connecting-IP` lo pone Cloudflare y no lo puede falsear el cliente. Si
 * viniera `X-Forwarded-For` el header sería falsificable, así que solo se usa
 * si Cloudflare no está delante.
 */
export function clientIp(request: Request): string {
  const cfIp = request.headers.get('CF-Connecting-IP');
  if (cfIp) return cfIp;

  const forwarded = request.headers.get('X-Forwarded-For');
  if (forwarded) return forwarded.split(',')[0]?.trim() ?? 'unknown';

  return 'unknown';
}

export const RATE_LIMITS = {
  /** Reserva pública: 6 por hora y IP. Holgado y suficiente. */
  booking: { name: 'booking', windowSeconds: 3600, max: 6 },
  /** Login del panel: 8 en 15 minutos. */
  login: { name: 'login', windowSeconds: 900, max: 8 },
  /** Consultas de disponibilidad: 120 por hora, es navegación normal. */
  availability: { name: 'availability', windowSeconds: 3600, max: 120 },
} satisfies Record<string, RateLimitOptions>;

/**
 * Vacía los contadores y la tabla. Solo para tests: la caché en memoria vive
 * en el isolate de workerd y los tests comparten almacenamiento.
 */
export async function clearRateLimits(db: D1Database): Promise<void> {
  counters.clear();
  await db.prepare('DELETE FROM rate_limits').run();
}