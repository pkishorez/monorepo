import { cloudflare } from '@kestack/kabuki/start/vite';
import { app } from '@kestack/web-platform/app/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    allowedHosts: ['.kabuki-playground.kishore.computer', '.ts.net'],
  },
  plugins: [
    app({
      name: 'Kabuki Playground',
      platform: cloudflare(),
      app: 'src/start',
      pwa: false,
    }),
  ],
});
