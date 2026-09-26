import { defineConfig } from 'vite-plus';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/** Lets the CPU speech model run on several threads; public/_headers does the same in production. */
const crossOriginIsolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig({
  resolve: { tsconfigPaths: true },
  build: { rolldownOptions: { external: ['cloudflare:workers'] } },
  // The speech worker and the microphone worklet are ES modules.
  worker: { format: 'es' },
  ssr: {
    noExternal: ['kui-toolkit'],
    resolve: { mainFields: ['browser', 'module', 'jsnext:main', 'jsnext'] },
  },
  server: {
    allowedHosts: ['.stt.kishore.computer'],
    headers: crossOriginIsolation,
  },
  preview: { headers: crossOriginIsolation },
  plugins: [
    tailwindcss(),
    tanstackStart({
      router: {
        indexToken: 'page',
        routeToken: 'layout',
      },
    }),
    react(),
  ],
});
