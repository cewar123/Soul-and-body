/**
 * Sesión del panel: cookie firmada con HMAC-SHA256.
 *
 * Por qué una cookie firmada y no JWT: no hay estado en el servidor que
 * mantener, no hay riesgo de revocar tokens robados por expiración, y con
 * `HttpOnly` + `SameSite=Strict` el JavaScript del navegador nunca puede leerla
 * — así un XSS no puede robar la sesión.
 *
 * El payload NO va cifrado, va firmado. Eso es deliberado: dentro solo hay
 * usuario y caducidad, que no son secretos. Si hiciera falta ocultar algo, el
 * sitio entero se arreglaría, no la cookie.
 */

import { timingSafeEqual } from './password.ts';

export const SESSION_COOKIE = 'sb_admin';
const DEFAULT_TTL_SECONDS = 8 * 60 * 60; // 8 horas: una jornada de trabajo.

interface Payload {
  /** Usuario del panel. */
  sub: string;
  /** Id del registro en `admins`. */
  sid: number;
  /** Caducidad, en segundos desde epoch. */
  exp: number;
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

async function hmac(secret: string, message: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message)));
}

async function encode(secret: string, payload: Payload): Promise<string> {
  const body = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await hmac(secret, body);
  return `${body}.${toBase64Url(signature)}`;
}

async function decode(secret: string, token: string): Promise<Payload | null> {
  const [body, signature] = token.split('.');
  if (!body || !signature) return null;

  const expected = await hmac(secret, body);
  const provided = fromBase64Url(signature);
  if (!timingSafeEqual(expected, provided)) return null;

  try {
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(body))) as Payload;
    if (typeof payload.sub !== 'string' || typeof payload.exp !== 'number') return null;
    return payload;
  } catch {
    return null;
  }
}

/** Genera el token firmado (el valor que viaja en cookie o en Bearer). */
export async function createSessionToken(
  secret: string,
  admin: { id: number; username: string },
  ttlSeconds: number = DEFAULT_TTL_SECONDS,
): Promise<string> {
  return encode(secret, {
    sub: admin.username,
    sid: admin.id,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  });
}

/**
 * Construye el valor de la cabecera `Set-Cookie` con la sesión iniciada.
 *
 * Es async porque firmar el payload requiere HMAC, que es una operación de Web
 * Crypto. Ojo: si se olvida el `await` aquí, la cabecera sale con
 * `[object Promise]` dentro y ninguna sesión valida.
 */
export async function sessionCookie(
  secret: string,
  admin: { id: number; username: string },
  options: { ttlSeconds?: number; secure?: boolean } = {},
): Promise<string> {
  const ttl = options.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  const token = await createSessionToken(secret, admin, ttl);

  return [
    `${SESSION_COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    // Strict: la cookie nunca viaja en peticiones iniciadas desde otro sitio,
    // ni siquiera por <img> o <form> en otra pestaña. El panel es same-origin.
    'SameSite=Strict',
    `Max-Age=${ttl}`,
    ...(options.secure === false ? [] : ['Secure']),
  ].join('; ');
}

/** Cabecera para cerrar sesión: se vacía la cookie almacenada. */
export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0; Secure`;
}

export interface AdminSession {
  username: string;
  adminId: number;
  expiresAt: number;
}

/**
 * Extrae el token de sesión de una request.
 *
 * Acepta dos transportes, porque `workers.dev` no es fiable para cookies:
 *
 *  1. `Authorization: Bearer <token>` — lo usa el panel cuando el navegador
 *     rechaza la cookie. El token viaja en `sessionStorage`, que se borra al
 *     cerrar la pestaña.
 *  2. `Cookie: sb_admin=<token>` — la vía que se usará con dominio propio.
 *
 * Se revisa el header primero: si ambos vienen, gana el header.
 */
function extractToken(request: Request): string | null {
  const header = request.headers.get('Authorization');
  if (header?.startsWith('Bearer ')) {
    const token = header.slice(7).trim();
    if (token) return token;
  }

  const cookieHeader = request.headers.get('Cookie');
  if (!cookieHeader) return null;

  return cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1) ?? null;
}

/**
 * Valida el token de una request y devuelve la sesión, o null.
 *
 * Verifica tres cosas: firma válida, formato esperado y que no haya caducado.
 */
export async function readSession(
  request: Request,
  secret: string,
  now: Date = new Date(),
): Promise<AdminSession | null> {
  const token = extractToken(request);
  if (!token) return null;

  const payload = await decode(secret, token);
  if (!payload) return null;

  if (payload.exp <= Math.floor(now.getTime() / 1000)) return null;

  return { username: payload.sub, adminId: payload.sid, expiresAt: payload.exp };
}

/** Comprueba que dos peticiones vienen del mismo origen (anti-CSRF). */
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('Origin');
  // Las peticiones GET no llevan Origin; solo se exige en las que modifican.
  if (!origin) return true;

  const expected = new URL(request.url).origin;
  return origin === expected;
}