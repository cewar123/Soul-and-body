/**
 * Normalización de datos de entrada.
 *
 * Todo lo que llega del formulario pasa por aquí antes de tocar la base de
 * datos. El motivo es concreto: si el teléfono se guarda tal cual escribe la
 * persona ("300 123 4567", "+57 300...", "3001234567"), luego no hay forma
 * confiable de generar un enlace de WhatsApp ni de comparar duplicados.
 */

/** Alfabeto sin caracteres ambiguos (sin 0/O ni 1/I/L) para referencias. */
const REFERENCE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/**
 * Normaliza un teléfono colombiano a E.164 (`+573001234567`).
 *
 * Acepta: `3001234567`, `+57 300 123 4567`, `57-300-1234567`,
 * `(604) 123 4567` (fijo de Medellín), `300 123 4567`.
 * Devuelve null si no queda un número colombiano plausible.
 */
export function normalizePhoneCol(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Conserva solo dígitos (quita +, espacios, guiones, paréntesis).
  let digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;

  // Prefijo de país explícito.
  if (digits.startsWith('57') && digits.length > 10) {
    digits = digits.slice(2);
  }

  // Un 0 de más al inicio: '0300123456' → '300123456'. Va ANTES de los
  // chequeos de longitud, porque si no un número escrito así mediría 10
  // dígitos y el prefijo '030' no parecería celular.
  if (digits.length === 11 && digits.startsWith('0')) {
    digits = digits.slice(1);
  }

  if (digits.length === 10) {
    const prefix = digits.slice(0, 3);
    const isMobile = prefix.startsWith('3');
    const isLandline = prefix.startsWith('60');
    if (isMobile || isLandline) return `+57${digits}`;
  }

  return null;
}

/** '+573001234567' → '300 123 4567' (para mostrar y para leer). */
export function formatPhoneDisplay(e164: string): string {
  const digits = e164.replace(/\D/g, '').replace(/^57/, '');
  // Fijo de Antioquia: 604 + 7 dígitos (10 en total).
  if (digits.length === 10 && digits.startsWith('604')) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 10) return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
  return e164;
}

/** Recorta y colapsa espacios, y quita caracteres de control. */
export function cleanText(raw: string, maxLength: number): string {
  return raw
    .replace(/[\p{Cc}\p{Cf}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

/** Quita tildes y baja a minúsculas, para buscar sin_drv. */
export function foldForSearch(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/**
 * Referencia pública de una cita: `SB-7Q3K2A`.
 * 31^6 ≈ 887 millones de combinaciones.
 */
export function generateReference(random: () => number = Math.random): string {
  let suffix = '';
  for (let i = 0; i < 6; i += 1) {
    const index = Math.floor(random() * REFERENCE_ALPHABET.length);
    suffix += REFERENCE_ALPHABET[index] ?? 'X';
  }
  return `SB-${suffix}`;
}

/**
 * Partículas que van en minúscula dentro de un nombre propio en español.
 * Sin esta lista, "María de Los Ángeles" saldría con mayúsculas en todas.
 */
const NAME_PARTICLES = new Set([
  'de',
  'del',
  'la',
  'las',
  'los',
  'y',
  'e',
  'da',
  'das',
  'do',
  'dos',
  'van',
  'von',
  'der',
  'ten',
  'ter',
]);

/** Normaliza un nombre propio: mayúscula inicial y partículas en minúscula. */
export function normalizeName(raw: string): string {
  return cleanText(raw, 120)
    .toLowerCase()
    .split(' ')
    .filter(Boolean)
    .map((word) => {
      // La comparación ignora apóstrofos y guiones para que "d'angelo" cuente
      // como partícula y "o'brien" no.
      const letters = word.replace(/[^\p{L}]/gu, '');
      if (NAME_PARTICLES.has(letters)) return word;

      // Mayúscula al inicio del nombre y tras apóstrofo o guion:
      // "o'brien" → "O'Brien", "ana-maria" → "Ana-Maria".
      return word.replace(
        /(^|[\s'’-])(\p{L})/gu,
        (_match, prefix: string, letter: string) => `${prefix}${letter.toLocaleUpperCase('es')}`,
      );
    })
    .join(' ');
}