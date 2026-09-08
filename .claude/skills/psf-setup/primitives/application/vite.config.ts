import { defineConfig } from 'vite-plus';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  build: { rolldownOptions: { external: ['cloudflare:workers'] } },
  ssr: {
    noExternal: ['kui-toolkit'],
    resolve: { mainFields: ['browser', 'module', 'jsnext:main', 'jsnext'] },
  },
  // Accept the Host headers the Portless proxy forwards during dev.
  server: { allowedHosts: ['.__LOCAL_HOST__'] },
  test: { include: ['src/**/*.test.ts'] },
  plugins: [
    tailwindcss(),
    tanstackStart({
      router: {
        indexToken: 'page',
        routeToken: 'layout',
        routeFileIgnorePattern: '^(components|internal)$',
      },
    }),
    react(),
  ],
});
