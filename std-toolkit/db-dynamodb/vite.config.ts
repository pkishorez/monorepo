import { defineConfig } from 'vite-plus';

export default defineConfig({
  lint: {
    ignorePatterns: ['**/dist/**', '**/src/generated/**'],
  },
  fmt: {
    ignorePatterns: ['**/dist/**', '**/src/generated/**'],
  },
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    globals: true,
    include: ['src/**/__tests__/**/*.test.ts'],
  },
});
