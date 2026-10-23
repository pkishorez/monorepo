import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    passWithNoTests: true,
    // Where the browser's clients call, as Vite would inline it.
    env: { VITE_POCKET_URL: 'https://pocket.test/' },
  },
});
