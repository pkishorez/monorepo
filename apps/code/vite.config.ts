import { defineConfig } from 'vite-plus';
import { TanStackRouterVite } from '@tanstack/router-plugin/vite';
import viteReact from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  lint: {
    ignorePatterns: ['**/dist/**'],
  },
  fmt: {
    ignorePatterns: ['**/dist/**'],
  },
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
