import { cloudflare } from '@kestack/kabuki/start/platform/cloudflare';
import { nitro as onNitro } from '@kestack/kabuki/start/platform/nitro';
import { start } from '@kestack/kabuki/start/vite';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { nitro } from 'nitro/vite';
import { defineConfig } from 'vite';

// Cloudflare by default, as Alchemy deploys it; `KABUKI_PLATFORM=nitro` builds
// for any Nitro preset instead, as `NITRO_PRESET` names it.
const viaNitro = process.env.KABUKI_PLATFORM === 'nitro';

export default defineConfig({
  server: {
    // Accept the Host headers the portless proxy and its Tailscale share forward during dev.
    allowedHosts: ['.kabuki-start.kishore.computer', '.ts.net'],
  },
  // Its components are ESM with CSS-only side effects: bundle them for the server too.
  ssr: { noExternal: ['@kestack/web-platform'] },
  plugins: [
    tailwindcss(),
    react(),
    start({
      platform: viaNitro ? onNitro() : cloudflare(),
      app: 'src/client/app',
      loaders: 'src/server/loaders.server',
    }),
    ...(viaNitro ? [nitro()] : []),
  ],
});
