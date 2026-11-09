import js from '@eslint/js';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    files: ['js/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.es2023,
      },
    },
  },
  {
    files: ['tests/**/*.mjs', 'tests/**/*.js', 'tools/**/*.js', 'tools/**/*.mjs'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.es2023,
      },
    },
  },
  {
    // e2e specs run in a browser context and use document/window/caches.
    // Without browser globals these produce false no-undef errors.
    files: ['tests/e2e/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
  },
];
