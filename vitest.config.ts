import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'apps/mobile/src'),
      '@happy-circles/shared': resolve(__dirname, 'packages/shared/src/index.ts'),
      '@happy-circles/application': resolve(__dirname, 'packages/application/src/index.ts'),
    },
  },
  test: {
    environment: 'node',
    exclude: ['**/node_modules/**', '**/.git/**', '**/.tmp/**'],
    include: ['packages/**/*.test.ts', 'apps/**/*.test.ts', 'tests/**/*.test.ts'],
    coverage: {
      reporter: ['text', 'html'],
    },
  },
});
