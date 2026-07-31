import { defineConfig } from 'vite-plus';

export default defineConfig({
  pack: {
    entry: ['src/cli.ts'],
    format: 'esm',
    platform: 'node',
    dts: false,
    publint: false,
  },
});
