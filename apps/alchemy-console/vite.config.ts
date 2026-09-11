import { defineConfig, type SsrDepOptimizationConfig } from 'vite-plus';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  build: { rolldownOptions: { external: ['cloudflare:workers'] } },
  // The optimized engine is local source; refresh it on each dev-server start.
  optimizeDeps: { force: true },
  ssr: {
    // Optimize the engine and provider entries together so dev never evaluates unused
    // alchemy exports (the Cloudflare Worker module resolves a workerd binary at import).
    // The SSR environment has its own optimizer that ignores the root `force`, so the
    // pre-bundled engine goes stale whenever its source changes unless forced here too.
    // Vite honors `force` at runtime even though the SSR config type omits it.
    optimizeDeps: {
      include: ['alchemy-console/deletion-engine', 'alchemy-console/providers'],
      force: true,
    } as SsrDepOptimizationConfig,
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
