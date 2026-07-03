import { defineConfig } from 'vite-plus';
import { devtools } from '@tanstack/devtools-vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { cloudflare } from '@cloudflare/vite-plugin';

const isTest = Boolean(process.env.VITEST);

const config = defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  server: {
    proxy: {
      '/api/auth': {
        target: 'http://localhost:20011',
        changeOrigin: true,
      },
    },
  },
  plugins: [
    devtools({ injectSource: { enabled: false } }),

    tailwindcss(),

    !isTest && cloudflare({ viteEnvironment: { name: 'ssr' } }),
    tanstackStart({
      prerender: {
        enabled: true,
        filter: (page) => !page.path.endsWith('.doc.md'),
      },
      router: {
        routeFileIgnorePattern: '(components|internal)',
      },
    }),
    viteReact(),
  ],
  test: {
    environment: 'node',
    passWithNoTests: true,
  },
});

export default config;
