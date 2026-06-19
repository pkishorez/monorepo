import { defineConfig } from 'vite-plus';

export default defineConfig({
  lint: {
    ignorePatterns: ['dist/**', '**/fixtures/**'],
  },
  fmt: {
    ignorePatterns: ['dist/**', '**/fixtures/**'],
  },
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    globals: true,
    include: ['src/**/__tests__/**/*.test.ts'],
  },
});
