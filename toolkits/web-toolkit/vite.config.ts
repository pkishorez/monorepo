import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite-plus';

const fixture = (name: string) =>
  fileURLToPath(new URL(`./test/pwa/${name}.ts`, import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Every module is its own file in dist, as in src, so each layer's
  // subpath loads only what it uses.
  pack: {
    entry: [
      'src/**/*.{ts,tsx}',
      '!src/**/*.test.{ts,tsx}',
      '!src/**/tests/**',
      '!src/**/*.fixture.tsx',
      '!src/**/fixtures/**',
      '!src/cosmos.decorator.tsx',
      '!src/**/*.d.ts',
    ],
    tsconfig: 'tsconfig.build.json',
    unbundle: true,
    format: 'esm',
    platform: 'neutral',
    // Declaration maps send Go to Definition to the source, not the .d.ts.
    dts: { sourcemap: true },
    sourcemap: true,
    publint: false,
    deps: { neverBundle: [/^virtual:/, /^node:/] },
  },
  test: {
    alias: {
      'virtual:pwa-toolkit/build': fixture('virtual-build'),
      'virtual:pwa-toolkit/client': fixture('virtual-client'),
    },
  },
});
