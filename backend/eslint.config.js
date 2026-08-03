// ESLint v9 flat config para Soul and Body.
'use strict';

module.exports = [
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: {
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        module: 'readonly',
        require: 'readonly',
        exports: 'readonly',
        global: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': 'off',
      'prefer-const': 'warn',
      eqeqeq: ['error', 'always'],
      'no-var': 'error',
      strict: ['error', 'global'],
    },
  },
  {
    ignores: ['node_modules/**', 'data/**', 'logs/**', 'coverage/**'],
  },
  {
    // Los tests suelen desestructurar todo el contexto aunque no usen cada parte.
    files: ['test/**/*.js'],
    rules: {
      'no-unused-vars': 'off',
    },
  },
];
