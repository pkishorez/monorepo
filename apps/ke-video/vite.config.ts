import { cloudflare } from '@kestack/kabuki/start/vite';
import { app } from '@kestack/web-platform/app/vite';
import { defineConfig } from 'vite';
import { api } from './src/web/server/api/index.ts';

export default defineConfig({
  server: {
    // `web:lan` listens beyond this machine: a phone may reach it by the
    // laptop's IP, always let in, or by its mDNS name, `<name>.local`.
    allowedHosts: ['.local'],
  },
  plugins: [
    // The web app's `/api/*`, ahead of Kabuki Start's pages.
    api(),
    // Kabuki Start, only ever served by `vp dev`, in Node: a local tool, so
    // no PWA and no DevTools. Start names a platform for a build, which
    // this app never has; Cloudflare's is the one the docs site runs
    // under plain `vp dev` too.
    app({
      name: 'ke-video',
      platform: cloudflare(),
      app: 'src/web/client/app',
      loaders: 'src/web/server/loaders.server',
      pwa: false,
      devtools: false,
    }),
  ],
});
