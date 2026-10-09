import react from '@vitejs/plugin-react';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  server: {
    port: 3000,
    // Accept the Host headers the portless proxy forwards during dev.
    allowedHosts: ['.docs.kishore.computer'],
  },
  build: {
    rollupOptions: {
      external: ['cloudflare:workers'],
    },
  },
  ssr: {
    noExternal: ['@kstackz/web-platform'],
    resolve: {
      mainFields: ['browser', 'module', 'jsnext:main', 'jsnext'],
    },
  },
  plugins: [
    tailwindcss(),
    tanstackStart({
      server: { entry: 'server.ts' },
    }),
    react(),
  ],
  resolve: {
    tsconfigPaths: true,
    dedupe: ['react', 'react-dom'],
    alias: {
      tslib: 'tslib/tslib.es6.js',
    },
  },
});
