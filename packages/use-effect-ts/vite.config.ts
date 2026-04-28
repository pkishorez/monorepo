import { defineConfig } from 'vite-plus';

export default defineConfig({
  lint: {
    ignorePatterns: ['dist/**'],
  },
  fmt: {
    ignorePatterns: ['dist/**'],
  },
});
