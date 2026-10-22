import { cloudflare } from '@kestack/kabuki/start/platform/cloudflare';
import { start } from '@kestack/kabuki/start/vite';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const platform = cloudflare();

export default defineConfig({
  server: {
    // Accept the Host headers the portless proxy and its Tailscale share forward during dev.
    allowedHosts: ['.code.kishore.computer', '.ts.net'],
  },
  // Its components are ESM with CSS-only side effects: bundle them for the server too.
  // Under `alchemy dev` the server runs in workerd: resolve with the Worker's
  // conditions, as the build does, not `development` (micromark's dev build
  // pulls in `debug`, which reads `process.stderr.fd` and throws there).
  ssr: {
    noExternal: ['@kestack/web-platform'],
    resolve: { conditions: [...platform.conditions] },
  },
  plugins: [tailwindcss(), react(), start({ platform, app: 'src/app' })],
});
