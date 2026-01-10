import { defineConfig } from 'vite';
import viteTsConfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [
    viteTsConfigPaths({
      projects: ['./tsconfig.json'],
    }),
  ],
  ssr: {},
  build: {
    ssr: './src/cli/index.ts',
    outDir: 'dist',
    target: 'node22',
    rollupOptions: {
      output: {
        entryFileNames: 'cli.js',
      },
    },
  },
  // @ts-ignore
  test: {
    globals: true,
    include: ['src/**/__tests__/**/*.test.ts'],
  },
});
