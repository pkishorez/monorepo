import { defineConfig } from 'vite';
import { TanStackRouterVite } from '@tanstack/router-plugin/vite';
import viteReact from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [
    tailwindcss(),
    TanStackRouterVite({
      routeFileIgnorePattern: '(components|internal)',
    }),
    viteReact(),
  ],
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
    },
  },
  test: {
    environment: 'node',
    passWithNoTests: true,
  },
});
