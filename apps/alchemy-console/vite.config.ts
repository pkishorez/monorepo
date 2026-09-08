import { defineConfig } from 'vite-plus';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  build: { rolldownOptions: { external: ['cloudflare:workers'] } },
  // The optimized engine is local source; refresh it on each dev-server start.
  optimizeDeps: { force: true },
  ssr: {
    // Optimize the narrow engine entry so dev does not evaluate unused CLI/emulator exports.
    optimizeDeps: {
      include: ['alchemy-console/stage-destruction-engine'],
    },
    noExternal: ['kui-toolkit'],
    resolve: { mainFields: ['browser', 'module', 'jsnext:main', 'jsnext'] },
  },
  server: {
    allowedHosts: [
      '.alchemy.local.kishore.app',
      '.alchemy.local.kishore.localhost',
      '.alchemy.local.kishore.rocks',
    ],
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
