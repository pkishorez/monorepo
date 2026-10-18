import { cloudflare } from '@kestack/kabuki/start/platform/cloudflare';
import { nitro } from '@kestack/kabuki/start/platform/nitro';
import { start } from '@kestack/kabuki/start/vite';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { nitro as nitroVite } from 'nitro/vite';
import { defineConfig } from 'vite';

// Where the server runs, by Vite's mode: Cloudflare through Alchemy by
// default, or a Nitro preset, as `vp build --mode vercel` names it.
const onNitro = {
  vercel: nitro({ preset: 'vercel' }),
  node: nitro({ preset: 'node_server' }),
  bun: nitro({ preset: 'bun' }),
} as const;

export default defineConfig(({ mode }) => {
  const platform = onNitro[mode as keyof typeof onNitro];
  return {
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
        platform: platform ?? cloudflare(),
        app: 'src/client/app',
        loaders: 'src/server/loaders.server',
      }),
      ...(platform ? [nitroVite()] : []),
    ],
  };
});
