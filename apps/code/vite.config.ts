import { cloudflare } from '@kestack/kabuki/start/platform/cloudflare';
import { start } from '@kestack/kabuki/start/vite';
import { pwa } from '@kestack/web-platform/pwa/vite';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    // Accept the Host headers the portless proxy and its Tailscale share forward during dev.
    allowedHosts: ['.code.kishore.computer', '.ts.net'],
  },
  // Its components are ESM with CSS-only side effects: bundle them for the server too.
  ssr: { noExternal: ['@kestack/web-platform'] },
  resolve: {
    // Under `alchemy dev` the server runs in workerd, where `debug`'s Node
    // build reads `process.stderr.fd` and throws (micromark's dev build
    // pulls it in). Its browser build is right everywhere this app runs.
    alias: { debug: 'debug/src/browser.js' },
  },
  plugins: [
    tailwindcss(),
    react(),
    start({ platform: cloudflare(), app: 'src/app' }),
    // Installable, and what was opened here opens offline: see public/
    // for the icons and the Offline Fallback.
    pwa({
      manifest: {
        name: 'Code',
        short_name: 'Code',
        description: 'Claude Code and Codex sessions in your project folders.',
        // The dark Theme's, as `Theme.manifest('dark')` gives them: the
        // Theme's module loads Inter's file, which Node cannot import here.
        theme_color: '#0a0a0a',
        background_color: '#0a0a0a',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
          { src: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
        ],
      },
    }),
  ],
});
