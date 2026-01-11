import { builtinModules } from 'node:module';
import { defineConfig } from 'vite';
import viteTsConfigPaths from 'vite-tsconfig-paths';

const nodeExternals = [
  ...builtinModules,
  ...builtinModules.map((m) => `node:${m}`),
];

export default defineConfig({
  plugins: [
    viteTsConfigPaths({
      projects: ['./tsconfig.json'],
    }),
  ],
  ssr: {
    noExternal: true,
    external: nodeExternals,
  },
  build: {
    ssr: './src/cli/index.ts',
    outDir: 'dist',
    target: 'node22',
    rollupOptions: {
      output: {
        entryFileNames: 'cli.js',
        banner: '#!/usr/bin/env node',
      },
    },
  },
  // @ts-ignore
  test: {
    globals: true,
    include: ['src/**/__tests__/**/*.test.ts'],
  },
});
