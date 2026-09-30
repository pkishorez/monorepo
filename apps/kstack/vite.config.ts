import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';
import { pwa } from '@kstackz/pwa-toolkit/vite';
import { createTheme } from '@kstackz/ui-toolkit/components/blocks/theme';
import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    // Accept the Host headers the portless proxy forwards during dev.
    allowedHosts: ['.kstack.kishore.computer'],
  },
  build: {
    rolldownOptions: { external: ['cloudflare:workers'] },
  },
  ssr: {
    noExternal: ['@kstackz/ui-toolkit'],
    resolve: {
      mainFields: ['browser', 'module', 'jsnext:main', 'jsnext'],
    },
  },
  plugins: [
    tailwindcss(),
    tanstackStart({
      // App Shell and Offline Fallback, both precached by pwa().
      spa: { enabled: true, prerender: { outputPath: '/_shell' } },
      pages: [
        {
          path: '/offline',
          prerender: {
            enabled: true,
            crawlLinks: false,
            autoSubfolderIndex: false,
          },
        },
      ],
      prerender: { autoStaticPathsDiscovery: false },
    }),
    react(),
    // After tanstackStart(): the worker builds after prerendering.
    pwa({
      // `PWA_DEV=true pnpm dev` runs the worker in dev too (Build ID `dev`).
      dev: process.env['PWA_DEV'] === 'true',
      manifest: {
        name: 'kstack',
        short_name: 'kstack',
        description:
          'Showcases of the app layouts and behaviours kstack supports.',
        ...createTheme().manifest('dark'),
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icons/maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: '/icons/apple-touch-icon.png',
            sizes: '180x180',
            type: 'image/png',
          },
        ],
      },
    }),
  ],
});
