import react from '@vitejs/plugin-react';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import mdx from 'fumadocs-mdx/vite';

export default defineConfig({
  server: {
    port: 3000,
    // Accept the Host headers the portless proxy forwards during dev.
    allowedHosts: ['.local.kishore.app'],
  },
  build: {
    rollupOptions: {
      external: ['cloudflare:workers'],
    },
  },
  ssr: {
    noExternal: ['kui-toolkit'],
    resolve: {
      mainFields: ['browser', 'module', 'jsnext:main', 'jsnext'],
    },
  },
  plugins: [
    mdx(),
    tailwindcss(),
    tanstackStart({
      server: { entry: 'server.ts' },
    }),
    react(),
  ],
  resolve: {
    tsconfigPaths: true,
    dedupe: ['@tanstack/db', '@tanstack/react-db', 'react', 'react-dom'],
    alias: {
      tslib: 'tslib/tslib.es6.js',
    },
  },
});
