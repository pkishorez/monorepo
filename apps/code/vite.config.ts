import { cloudflare } from '@kestack/kabuki/start/cloudflare';
import { app } from '@kestack/web-platform/app/vite';
import { defineConfig } from 'vite';
import { pluginCode } from './scripts/plugin-code.ts';

export default defineConfig(({ command }) => ({
  // The Release of the code Plugin Code calls, read as it is built.
  define: {
    'import.meta.env.PLUGIN_CODE': JSON.stringify(
      pluginCode(command === 'serve'),
    ),
  },
  server: {
    // Accept the Host headers the portless proxy and its Tailscale share forward during dev.
    allowedHosts: ['.code.kishore.computer', '.ts.net'],
  },
  plugins: [
    // Kabuki Start on Cloudflare, and a PWA whose icons are the ones
    // public/ holds by name. Its Splash and screenshots are drawn into
    // public/ by `pnpm draw:install`.
    app({
      name: 'Code',
      platform: cloudflare(),
      app: 'src/app',
      pwa: {
        splash: true,
        manifest: {
          short_name: 'Code',
          description:
            'Claude Code and Codex sessions in your project folders.',
          screenshots: [
            {
              src: '/screenshots/narrow.png',
              sizes: '1080x1920',
              type: 'image/png',
              form_factor: 'narrow',
              label: 'Code',
            },
            {
              src: '/screenshots/wide.png',
              sizes: '1920x1080',
              type: 'image/png',
              form_factor: 'wide',
              label: 'Code',
            },
          ],
        },
      },
    }),
  ],
}));
