import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-plugin-prettier';
import prettierConfig from 'eslint-config-prettier';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist', 'eslint.config.js', 'vite.config.js', 'wrap-function.js'] },

  // Base JS + TypeScript recommended rule sets.
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Node-run build tooling (POT extraction) — Node globals, not browser.
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: { globals: globals.node, sourceType: 'module' },
  },

  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    settings: { react: { version: '18.3' } },
    plugins: {
      react,
      prettier,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...react.configs.recommended.rules,
      ...react.configs['jsx-runtime'].rules,
      ...reactHooks.configs.recommended.rules,

      'react/jsx-no-target-blank': 'off',
      'react-hooks/rules-of-hooks': 'error',
      'react/prop-types': 'off',
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],

      // TypeScript handles undefined-var checking; the core rule misfires on
      // types/JSX. Allow leading-underscore args/vars as intentional unused.
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          // `catch (error)` bindings kept for readability / future logging are
          // not flagged even when currently unused.
          caughtErrors: 'none',
        },
      ],

      // `any` is used deliberately for not-yet-modelled API response data during
      // the JS->TS migration. Surface it as a warning (tech debt) rather than a
      // hard error so it doesn't block CI; tighten per-endpoint over time.
      '@typescript-eslint/no-explicit-any': 'warn',

      'prettier/prettier': [
        'error',
        {
          trailingComma: 'es5',
          singleQuote: true,
          printWidth: 80,
          tabWidth: 2,
          semi: true,
          endOfLine: 'auto',
        },
      ],
    },
  },

  // Ambient declaration files: augmentation patterns the unused-vars rule
  // misreads.
  {
    files: ['**/*.d.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
      'no-unused-vars': 'off',
    },
  },

  // Disable any stylistic ESLint rules that would conflict with Prettier.
  // Kept LAST so it overrides earlier rule sets.
  prettierConfig
);
