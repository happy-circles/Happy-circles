import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@happy-circles/shared': resolve(__dirname, 'packages/shared/src/index.ts'),
      '@happy-circles/domain': resolve(__dirname, 'packages/domain/src/index.ts'),
      '@happy-circles/application': resolve(__dirname, 'packages/application/src/index.ts'),
      '@happy-circles/infrastructure': resolve(__dirname, 'packages/infrastructure/src/index.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['packages/**/*.test.ts'],
    coverage: {
      reporter: ['text', 'html'],
    },
  },
});
