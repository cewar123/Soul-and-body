/**
 * Hash de contraseñas con PBKDF2-SHA256 vía WebCrypto.
 *
 * Por qué no bcrypt: los módulos nativos de Node no existen en Workers sin
 * `nodejs_compat` y bcryptjs es lento en el isolate. PBKDF2 es parte de Web
 * Crypto, así que funciona nativo, sin flags y sin dependencias.
 *
 * Formato almacenado (auto-descriptivo, permite migrar iteraciones después):
 *   pbkdf2$<iteraciones>$<salt base64url>$<hash base64url>
 */

const ALGORITHM = 'PBKDF2';
const HASH = 'SHA-256';
const KEY_LENGTH_BITS = 256;
const SALT_BYTES = 16;

/**
 * Iteraciones por defecto.
 *
 * PBKDF2 es deliberadamente caro, y en el plan Workers **Free** cada request
 * tiene solo 10 ms de CPU. Medido en producción:
 *
 *   20 000 · 50 000 · 80 000  →  login funciona
 *   120 000 · 210 000          →  login falla
 *
 * 210 000 es lo que recomienda OWASP, pero revienta el presupuesto de CPU del
 * plan gratuito: workerd aborta el `deriveBits` y el login se rechaza como si
 * la contraseña fuese incorrecta. Por eso el valor por defecto es 100 000.
 *
 * Con **Workers Paid** (5 USD/mes) el límite de CPU es de 30 s y se puede
 * subir a 210 000 cambiando esta constante. Vale la pena: es la única forma de
 * que el panel sea resistente a fuerza bruta sin depender del plan.
 */
const DEFAULT_ITERATIONS = 100_000;

/** Recomendación de OWASP, solo alcanzable con Workers Paid. */
export const OWASP_ITERATIONS = 210_000;

export interface PasswordHash {
  algorithm: string;
  iterations: number;
  salt: string;
  hash: string;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function derive(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    // `.buffer` en vez del TypedArray: TypeScript 6 parametriza Uint8Array por su
    // ArrayBuffer y un Uint8Array<ArrayBufferLike> no es un BufferSource válido.
    new TextEncoder().encode(password).buffer,
    ALGORITHM,
    false,
    ['deriveBits'],
  );

  const bits = await crypto.subtle.deriveBits(
    { name: ALGORITHM, hash: HASH, salt: salt.buffer as ArrayBuffer, iterations },
    key,
    KEY_LENGTH_BITS,
  );

  return new Uint8Array(bits);
}

/** Genera un hash listo para guardar en `admins.password_hash`. */
export async function hashPassword(
  password: string,
  iterations = DEFAULT_ITERATIONS,
): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derive(password, salt, iterations);
  return `pbkdf2$${iterations}$${toBase64Url(salt)}$${toBase64Url(hash)}`;
}

/**
 * Verifica una contraseña contra un hash almacenado.
 *
 * Devuelve false si el formato no se reconoce, para que un registro corrupto
 * no provoque una excepción que tumbe el login.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;

  const iterations = Number.parseInt(parts[1] ?? '', 10);
  if (!Number.isInteger(iterations) || iterations < 1) return false;

  const saltValue = parts[2];
  const expectedValue = parts[3];
  if (!saltValue || !expectedValue) return false;

  try {
    const hash = await derive(password, fromBase64Url(saltValue), iterations);
    const expected = fromBase64Url(expectedValue);
    return timingSafeEqual(hash, expected);
  } catch (error) {
    // Un fallo aquí NO es "contraseña incorrecta". Lo más probable es que el
    // plan no tenga presupuesto de CPU para estas iteraciones: workerd aborta
    // el cálculo y sin este log el síntoma sería un 401 silencioso e
    // imposible de diagnosticar.
    console.error(
      `[auth] no se pudo verificar la contraseña (iterations=${iterations}). ` +
        'Si es la primera vez que pasa, revisa el límite de CPU del plan: ' +
        `baja DEFAULT_ITERATIONS o sube el plan. Error: ${String(error)}`,
    );
    return false;
  }
}

/**
 * Comparación en tiempo constante.
 *
 * Un `===` sobre el hash filtra información: tarda más en fallar si los
 * primeros bytes coinciden, y eso permite reconstruir el hash byte a byte.
 */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;

  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
}

export { DEFAULT_ITERATIONS };