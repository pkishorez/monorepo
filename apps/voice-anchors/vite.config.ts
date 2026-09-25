import { defineConfig } from 'vite-plus';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

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
    allowedHosts: ['.tts.kishore.computer'],
  },
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
