import { cloudflare } from '@kestack/kabuki/start/cloudflare';
import { start } from '@kestack/kabuki/start/vite';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type PluginOption } from 'vite';

// Builds the Auth Worker's pages, a Kabuki Start app, into dist/worker/app:
// the browser's files in client/, and the server as one module in ssr/ that
// carries every dependency it uses. scripts/bundle-app.mts embeds the
// browser's files and pairs the server with the worker.
export default defineConfig({
  build: { outDir: 'dist/worker/app', emptyOutDir: false },
  // The Worker's own size counts against Cloudflare's script limit.
  environments: { ssr: { build: { minify: true } } },
  plugins: [
    tailwindcss(),
    react(),
    // Kabuki is typed against its own copy of Vite's types.
    start({
      platform: cloudflare(),
      app: 'src/worker/app/app',
      loaders: 'src/worker/app/loaders.server',
    }) as unknown as PluginOption,
  ],
});
