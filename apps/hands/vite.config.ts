import { cloudflare } from '@kestack/kabuki/start/platform/cloudflare';
import { start } from '@kestack/kabuki/start/vite';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    // Accept the Host headers the portless proxy and its Tailscale share forward during dev.
    allowedHosts: ['.hands.kishore.computer', '.ts.net'],
  },
  // Its components are ESM with CSS-only side effects: bundle them for the server too.
  ssr: { noExternal: ['@kestack/web-platform'] },
  plugins: [
    tailwindcss(),
    react(),
    start({
      platform: cloudflare(),
      app: 'src/client/app',
      loaders: 'src/server/loaders.server',
    }),
  ],
});
