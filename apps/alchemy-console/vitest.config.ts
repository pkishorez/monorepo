import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    // The Worker tests build the app once and start Miniflare.
    testTimeout: 30_000,
    hookTimeout: 180_000,
  },
});
