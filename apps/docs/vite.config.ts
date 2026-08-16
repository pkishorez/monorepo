import react from '@vitejs/plugin-react';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import mdx from 'fumadocs-mdx/vite';

export default defineConfig({
  server: {
    port: 3000,
  },
  plugins: [
    mdx(),
    tailwindcss(),
    // No prerender: pages SSR on the Worker at request time. Prerendering
    // crashes silently inside the Cloudflare Vite plugin's workerd runtime
    // during `alchemy deploy` (works under plain node `vite build`).
    tanstackStart(),
    react(),
  ],
  resolve: {
    tsconfigPaths: true,
    alias: {
      tslib: 'tslib/tslib.es6.js',
    },
  },
});
