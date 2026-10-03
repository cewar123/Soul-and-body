import js from '@eslint/js';
import ts from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import * as astro from 'astro-eslint-parser';

export default ts.config(
  {
    ignores: [
      'dist/**',
      '.astro/**',
      '.wrangler/**',
      'node_modules/**',
      'worker-configuration.d.ts',
      'public/**',
    ],
  },

  // ── TypeScript / .ts ────────────────────────────────────────────────────────
  {
    files: ['**/*.{ts,mjs}'],
    extends: [js.configs.recommended, ...ts.configs.strictTypeChecked, prettier],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // El runtime es Worker: Web APIs, sin Node. Nada de `any` implícito.
      '@typescript-eslint/no-explicit-any': 'error',
      'no-console': ['error', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'prefer-const': 'error',
      'no-var': 'error',
      'object-shorthand': 'error',
      'no-return-await': 'error',

      // Interpolar números en plantillas es seguro y es como se formatean
      // fechas y precios. La regla por defecto solo admite strings.
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        { allowNumber: true, allowBoolean: false, allowNullish: false },
      ],
    },
  },

  // ── .astro ─────────────────────────────────────────────────────────────────
  // astro-eslint-parser v3 es solo un parser (ya no expone `configs`), así que
  // se registra directamente en languageOptions. El type-check del template lo
  // hace `astro check`, no ESLint.
  {
    files: ['**/*.astro'],
    extends: [prettier],
    languageOptions: {
      parser: astro,
      parserOptions: { parser: ts.parser },
    },
    rules: {
      'no-undef': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'prefer-const': 'off',
      'no-var': 'off',
    },
  },

  // ── Scripts de Node (migraciones, seed) ────────────────────────────────────
  {
    files: ['scripts/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },

  // ── Tests ──────────────────────────────────────────────────────────────────
  {
    files: ['tests/**/*.ts'],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      // `res.json()` está tipado como `any` en los tipos de Workers, así que la
      // aserción explícita es la que aporta el tipo; la regla solo estorba.
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      // `declare global { namespace Cloudflare { ... } }` es la forma oficial
      // de ampliar los bindings de Cloudflare para los tests.
      '@typescript-eslint/no-namespace': 'off',
    },
  },
);