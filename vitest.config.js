import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['app/tests/**/*.test.js', 'extension/tests/**/*.test.js', 'extension/test/**/*.test.js'],
    globals: true,
    testTimeout: 10000
  }
});