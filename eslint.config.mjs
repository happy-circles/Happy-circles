import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      '**/.expo/**',
      'supabase/migrations/**/*.sql',
      'supabase/functions/**/*.ts',
      'apps/mobile/babel.config.js',
      'apps/mobile/index.js',
      'apps/mobile/scripts/**/*.mjs',
      'apps/landing/next.config.mjs',
      'eslint.config.mjs',
      'prettier.config.cjs',
      'scripts/**/*.mjs',
      'vitest.config.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        ...globals.node,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/require-await': 'off',
    },
  },
  {
    files: ['apps/mobile/**/*.{ts,tsx}'],
    ignores: ['apps/mobile/src/lib/navigation.ts'],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'CallExpression[callee.object.name="router"][callee.property.name=/^(back|dismiss|dismissTo|push|replace)$/]',
          message:
            'Use src/lib/navigation.ts helpers so route changes do not duplicate screens in history.',
        },
      ],
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: false }],
    },
  },
  {
    files: ['apps/landing/**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
  },
);
