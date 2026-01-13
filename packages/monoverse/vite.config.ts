import { defineConfig } from 'vite';
import viteTsConfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [
    viteTsConfigPaths({
      projects: ['./tsconfig.json'],
    }),
  ],
  // @ts-ignore
  test: {
    globals: true,
    include: ['src/**/__tests__/**/*.test.ts'],
  },
});
