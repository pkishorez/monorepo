import { cloudflare } from '@kestack/kabuki/start/cloudflare';
import { app } from '@kestack/web-platform/app/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    // Accept the Host headers the portless proxy and its Tailscale share forward during dev.
    allowedHosts: ['.kabuki-start.kishore.computer', '.ts.net'],
  },
  plugins: [
    // Kabuki Start on Cloudflare, and a PWA whose icons are the ones
    // public/ holds by name.
    app({
      name: 'Kabuki Start',
      platform: cloudflare(),
      app: 'src/client/app',
      loaders: 'src/server/loaders.server',
    }),
  ],
});
