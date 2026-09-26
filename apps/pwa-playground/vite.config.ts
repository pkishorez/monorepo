import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';
import { pwa } from 'pwa-toolkit/vite';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { runtimeCache } from './src/lib/runtime-cache-rules.ts';

// Deploy-time switches. CI sets them from the workflow inputs; see README.
const enabled = process.env.PWA_ENABLED !== 'false';
const preset = process.env.PWA_PRESET === 'content' ? 'content' : 'app';
const buildLabel = process.env.BUILD_LABEL ?? 'local';
// `PWA_DEV=true pnpm dev` also runs the worker in dev (Build ID `dev`, no Precache).
const dev = process.env.PWA_DEV === 'true';

// `vite preview` stand-in for Cloudflare's asset HTML handling, which serves
// /_shell from _shell.html. The Precache fetches /_shell, so without this a
// local preview fails the worker install.
const previewCleanUrls = (): Plugin => ({
  name: 'pwa-playground:preview-clean-urls',
  enforce: 'pre',
  configurePreviewServer(server) {
    const dir = join(server.config.root, 'dist/client');
    server.middlewares.use((req, _res, next) => {
      const [path = '/', query] = (req.url ?? '/').split('?');
      if (!path.includes('.') && existsSync(join(dir, `${path}.html`))) {
        req.url = `${path}.html${query === undefined ? '' : `?${query}`}`;
      }
      next();
    });
  },
});

export default defineConfig({
  server: {
    // Accept the Host headers the portless proxy forwards during dev.
    allowedHosts: ['.pwa.kishore.computer'],
  },
  // Inlined into the client bundle, so every label changes the Build ID.
  define: {
    __BUILD_LABEL__: JSON.stringify(buildLabel),
    __PWA_PRESET__: JSON.stringify(preset),
    __PWA_ENABLED__: JSON.stringify(enabled),
  },
  build: {
    rolldownOptions: { external: ['cloudflare:workers'] },
  },
  ssr: {
    noExternal: ['kui-toolkit'],
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
      enabled,
      dev,
      preset,
      manifest: {
        name: 'PWA Playground',
        short_name: 'PWA Lab',
        description: 'Every pwa-toolkit scenario on one page each.',
        theme_color: '#18181b',
        background_color: '#18181b',
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
      runtimeCache,
    }),
    previewCleanUrls(),
  ],
});
