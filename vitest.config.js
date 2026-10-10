import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['app/tests/**/*.test.js'],
    globals: true,
    testTimeout: 10000
  }
});