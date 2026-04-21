import { defineConfig } from 'vite-plus';

export default defineConfig({
  pack: [
    {
      entry: ['src/cli.ts'],
      format: 'esm',
      banner: { js: '#!/usr/bin/env node' },
      outDir: 'dist',
      clean: true,
    },
    {
      entry: ['src/api/definitions/index.ts'],
      format: 'esm',
      dts: true,
      sourcemap: 'inline',
      outDir: 'dist/api/definitions',
    },
    {
      entry: ['src/core/entity/index.ts'],
      format: 'esm',
      dts: true,
      sourcemap: 'inline',
      outDir: 'dist/entity',
    },
  ],
});
