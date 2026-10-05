/**
 * Bindings que `wrangler types` no conoce.
 *
 * El generador solo declara lo que está en `vars` y `d1_databases`. Los secretos
 * añadidos con `wrangler secret put` no aparecen, así que se declaran aquí.
 * Sin este archivo, `c.env.TURNSTILE_SECRET_KEY` sería un error de tipos.
 */
declare global {
  interface Env {
    /**
     * Secreto de Cloudflare Turnstile. Opcional: si no está, el widget omite el
     * challenge, lo cual solo es aceptable en desarrollo.
     */
    TURNSTILE_SECRET_KEY?: string;
    /** Clave HMAC-SHA256 para firmar la cookie de sesión del panel. */
    SESSION_SECRET: string;
  }
}

export {};