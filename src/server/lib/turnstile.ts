/**
 * Verificación de Cloudflare Turnstile.
 *
 * Turnstile es el CAPTCHA invisible de Cloudflare: sin acertijos ni preguntas
 * cumbersome, y en plan gratuito. Es lo que protege el formulario de reservas
 * frente a bots — un honeypot solo frena a los bots dumb, no a los que leen el
 * formulario.
 *
 * Si no hay `TURNSTILE_SECRET_KEY` configurada, la verificación se omite y se
 * deja pasar. Es lo que permite trabajar en local sin dar de alta nada, pero en
 * producción la clave es obligatoria: si falta, el endpoint devuelve 500 en vez
 * de dejar el formulario abierto.
 */

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export type TurnstileOutcome = 'pass' | 'fail' | 'skipped';

export interface TurnstileResult {
  outcome: TurnstileOutcome;
  errorCodes: string[];
}

export async function verifyTurnstile(
  request: Request,
  token: string,
  options: { secret?: string; remoteIp?: string },
): Promise<TurnstileResult> {
  const secret = options.secret;
  if (!secret) {
    console.warn('[turnstile] sin TURNSTILE_SECRET_KEY: se omite la verificación');
    return { outcome: 'skipped', errorCodes: [] };
  }

  // Sin token no hay nada que verificar: se rechaza. Nunca se omite.
  if (!token) {
    return { outcome: 'fail', errorCodes: ['missing-input-response'] };
  }

  const form = new FormData();
  form.set('secret', secret);
  form.set('response', token);
  if (options.remoteIp) form.set('remoteip', options.remoteIp);

  try {
    const response = await fetch(VERIFY_URL, { method: 'POST', body: form });
    if (!response.ok) {
      console.error('[turnstile] siteverify respondió', response.status);
      return { outcome: 'fail', errorCodes: ['http-error'] };
    }

    const result = await response.json();

    if (typeof result !== 'object' || result === null || !('success' in result)) {
      return { outcome: 'fail', errorCodes: ['bad-response'] };
    }

    const codes = 'error-codes' in result ? result['error-codes'] : undefined;
    return {
      outcome: result.success ? 'pass' : 'fail',
      errorCodes: Array.isArray(codes) ? codes.map(String) : [],
    };
  } catch (error) {
    // Si Cloudflare no responde, no se bloquea el negocio: se registra y se deja
    // pasar. El rate limit sigue activo como segunda barrera.
    console.error('[turnstile] fallo de red en siteverify', error);
    return { outcome: 'skipped', errorCodes: ['network-error'] };
  }
}

/** Comprueba si las claves de prueba de Cloudflare están en uso. */
export function isTestKey(secret: string | undefined): boolean {
  return secret?.startsWith('1x0000000000000000000000000000000AA') === true;
}