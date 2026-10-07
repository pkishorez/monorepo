import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';
import { pwa } from '@kstackz/web-toolkit/pwa/vite';
import { createTheme } from '@kstackz/web-toolkit/theme';
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
    noExternal: ['@kstackz/web-toolkit'],
    resolve: {
      mainFields: ['browser', 'module', 'jsnext:main', 'jsnext'],
    },
  },
  plugins: [
    tailwindcss(),
    tanstackStart({
      // The router and routes are in src; the Worker starts in src/worker.ts.
      srcDirectory: 'src',
      server: { entry: './worker.ts' },
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
        name: 'Ledger',
        short_name: 'Ledger',
        description:
          'Writes down the money you spend and earn. Powered by kstack.',
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
