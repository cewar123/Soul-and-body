import type { Context, Env } from 'hono';

/**
 * Mínimo estructural de un error de Zod.
 *
 * Se declara así a propósito: Hono tipa el error del hook como `$ZodError` del
 * núcleo de Zod 4, mientras que la clase `ZodError` es la API antigua. El hook
 * solo necesita `issues`, y tiparlo por estructura lo hace compatible con
 * ambas sin importar casts.
 */
interface IssueLike {
  path: readonly PropertyKey[];
  message: string;
}

interface ErrorLike {
  issues: readonly IssueLike[];
}

/**
 * Traduce un fallo de validación a algo que el formulario pueda pintar.
 *
 * Sin este hook, `@hono/zod-validator` devuelve el `ZodError` crudo: filtra
 * nombres de campos internos y obliga al cliente a parsear la estructura de
 * Zod. Aquí sale:
 *
 *   { "error": "validation_error",
 *     "message": "El texto que se muestra",
 *     "fields": { "phone": "Ese número no parece válido." } }
 *
 * `fields` mapea campo → primer mensaje, pensado para marcar los inputs
 * concretos. El status es 422 si el error es del objeto completo (p.ej. "falta
 * date o month") y 400 si es de un campo concreto, siguiendo la convención.
 */
export function validationHook<T, E extends Env, P extends string, Target extends string>(
  result:
    | { success: true; data: T; target: Target }
    | { success: false; data: T; error: ErrorLike; target: Target },
  c: Context<E, P>,
): Response | undefined {
  if (result.success) return undefined;

  if (result.error.issues.length === 0) {
    return c.json({ error: 'validation_error', message: 'Revisa los datos del formulario.' }, 422);
  }

  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.map(String).join('.') || '_';
    fields[key] ??= issue.message;
  }

  const first = result.error.issues[0];
  const message =
    (first && first.path.length === 0 ? first.message : Object.values(fields)[0]) ??
    'Revisa los datos del formulario.';
  const status = first && first.path.length === 0 ? 422 : 400;

  return c.json({ error: 'validation_error', message, fields }, status as 400);
}