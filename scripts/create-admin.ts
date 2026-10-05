/**
 * Crea o actualiza el usuario del panel.
 *
 *   npm run admin:create -- --user wendy --password "MiClaveSegura123"
 *   npm run admin:create -- --user wendy --remote
 *
 * Genera el hash PBKDF2, escribe un SQL temporal y lo aplica con wrangler. No
 * imprime nunca la contraseña. `--remote` aplica en la base de producción.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { hashPassword } from '../src/server/lib/password.ts';

interface Args {
  user: string | null;
  password: string | null;
  remote: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { user: null, password: null, remote: false };

  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];

    if (flag === '--user' && value) {
      args.user = value.toLowerCase();
      i += 1;
    } else if (flag === '--password' && value) {
      args.password = value;
      i += 1;
    } else if (flag === '--remote') {
      args.remote = true;
    }
  }

  return args;
}

/** Lectura sin eco, para no exponer la contraseña en pantalla. */
async function promptHidden(question: string): Promise<string> {
  const readline = await import('node:readline');
  const { stdout } = await import('node:process');

  return new Promise((resolve) => {
    const input = readline.createInterface({ input: process.stdin, output: stdout, terminal: true });

    // readline no trae lectura oculta: se reescribe `write` para no imprimir lo
    // que se teclea, y se pinta un asterisco por carácter.
    const original = stdout.write.bind(stdout);
    let count = 0;
    stdout.write = ((chunk: string | Uint8Array): boolean => {
      const text = String(chunk);
      if (text.includes('password') || count > 0) {
        if (text.includes('\n')) {
          count = 0;
          original('\n');
        } else {
          count += 1;
          original('*');
        }
        return true;
      }
      return original(chunk);
    });

    input.question(question, (answer) => {
      stdout.write = original;
      input.close();
      original('\n');
      resolve(answer);
    });
  });
}

function validatePassword(password: string): void {
  const problems: string[] = [];
  if (password.length < 12) problems.push('mínimo 12 caracteres');
  if (!/[a-z]/.test(password)) problems.push('una minúscula');
  if (!/[A-Z]/.test(password)) problems.push('una mayúscula');
  if (!/\d/.test(password)) problems.push('un número');

  if (problems.length > 0) {
    throw new Error(`La contraseña necesita: ${problems.join(', ')}.`);
  }
}

/** Escapa comillas simples para incrustar en SQL. */
function sqlText(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (!args.user) {
    throw new Error(
      'Falta --user.\n  npm run admin:create -- --user wendy --password "ClaveSegura123"',
    );
  }

  const password = args.password ?? (await promptHidden(`Contraseña para "${args.user}": `));
  validatePassword(password);

  console.log('Generando hash PBKDF2…');
  const hash = await hashPassword(password);

  // Sin comentarios `--`: `wrangler d1 execute --command` los interpreta mal
  // y falla el lote entero.
  const sql = `INSERT INTO admins (username, password_hash) VALUES (${sqlText(args.user)}, ${sqlText(hash)}) ON CONFLICT (username) DO UPDATE SET password_hash = excluded.password_hash;`;

  const file = path.join(mkdtempSync(path.join(tmpdir(), 'sb-admin-')), 'admin.sql');
  writeFileSync(file, sql, 'utf8');

  const target = args.remote ? '--remote' : '--local';
  console.log(`Aplicando en la base ${target.replace('--', '')}…`);

  try {
    execFileSync(
      'npx',
      ['wrangler', 'd1', 'execute', 'soul-and-body', target, `--file=${file}`],
      { stdio: 'inherit' },
    );
  } catch {
    throw new Error(
      `No se pudo aplicar el SQL. Puedes hacerlo a mano con:\n  npx wrangler d1 execute soul-and-body ${target} --command "${sql}"`,
    );
  }

  console.log(`\nUsuario "${args.user}" listo. Entra en /admin con esa contraseña.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});