import { cloudflare } from '@kestack/kabuki/start/platform/cloudflare';
import { app } from '@kestack/web-platform/app/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    // Accept the Host headers the portless proxy and its Tailscale share forward during dev.
    allowedHosts: ['.code.kishore.computer', '.ts.net'],
  },
  plugins: [
    // Kabuki Start on Cloudflare, and a PWA whose icons are the ones
    // public/ holds by name.
    app({
      name: 'Code',
      platform: cloudflare(),
      app: 'src/app',
      pwa: {
        manifest: {
          description:
            'Claude Code and Codex sessions in your project folders.',
        },
      },
    }),
  ],
});
