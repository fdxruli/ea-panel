import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

// ============================================================
// Shared rule fragments
// ============================================================
const unusedVarRules = {
  args: 'after-used',
  argsIgnorePattern: '^_',
  caughtErrors: 'all',
  caughtErrorsIgnorePattern: '^_',
  ignoreRestSiblings: true,
  varsIgnorePattern: '^[A-Z_]',
}

// ============================================================
// Main ESLint flat config
// ============================================================
export default defineConfig([
  // --- Global ignores ---
  globalIgnores([
    'dist',
    'node_modules',
    '.qwen',
    '*.min.js',
    'coverage',
    '.vite',
  ]),

  // --- Linter options ---
  {
    name: 'linter/options',
    linterOptions: {
      reportUnusedDisableDirectives: 'warn',
    },
  },

  // ============================================================
  // JavaScript / JSX — all source files
  // ============================================================
  {
    name: 'app/base',
    files: ['**/*.{js,jsx,mjs,cjs}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.browser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      // ── Possible Errors (beyond recommended) ──
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-debugger': 'warn',
      'no-promise-executor-return': 'error',
      'no-template-curly-in-string': 'warn',
      'no-unreachable-loop': 'warn',
      'require-atomic-updates': 'warn',

      // ── Best Practices ──
      'array-callback-return': ['warn', { checkForEach: false }],
      'consistent-return': 'warn',
      'curly': ['warn', 'multi-line'],
      'default-case': 'warn',
      'dot-notation': 'warn',
      'eqeqeq': ['warn', 'always', { null: 'ignore' }],
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-lone-blocks': 'warn',
      'no-multi-str': 'warn',
      'no-new-func': 'error',
      'no-return-await': 'warn',
      'no-self-compare': 'warn',
      'no-sequences': 'error',
      'no-throw-literal': 'warn',
      'no-unmodified-loop-condition': 'warn',
      'no-useless-catch': 'warn',
      'no-useless-concat': 'warn',
      'no-useless-escape': 'warn',
      'no-useless-return': 'warn',
      'no-void': 'warn',
      'radix': ['warn', 'as-needed'],
      'require-await': 'warn',

      // ── Variables ──
      'no-unused-vars': ['warn', unusedVarRules],
      'no-use-before-define': ['warn', { functions: false, classes: true }],

      // ── React Hooks ──
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // ── Vite HMR ──
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],

      // ── Stylistic (light touch — doesn't block dev) ──
      'no-mixed-spaces-and-tabs': 'warn',
      'no-multiple-empty-lines': ['warn', { max: 2, maxBOF: 0, maxEOF: 0 }],
      'no-trailing-spaces': 'warn',
      'no-whitespace-before-property': 'warn',
    },
  },

  // ============================================================
  // Context files — allow extra exports (createContext, Provider, hook)
  // ============================================================
  {
    name: 'app/context-files',
    files: ['src/context/**/*.{js,jsx}'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },

  // ============================================================
  // Node.js scripts (config, build, serverless)
  // ============================================================
  {
    name: 'node/scripts',
    files: [
      'eslint.config.js',
      'vite.config.js',
      'scripts/**/*.{js,mjs,cjs}',
      'api/**/*.{js,mjs,cjs}',
    ],
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      'no-console': 'off',
    },
  },

  // ============================================================
  // Service worker
  // ============================================================
  {
    name: 'service-worker',
    files: ['src/sw.js'],
    languageOptions: {
      globals: globals.serviceworker,
    },
  },

  // ============================================================
  // Supabase Edge Functions (TypeScript / Deno)
  // ============================================================
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: ['supabase/functions/**/*.{ts,tsx}'],
  })),
  {
    name: 'supabase/functions',
    files: ['supabase/functions/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.worker,
        Deno: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', unusedVarRules],
    },
  },
])
