import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, type ProxyOptions } from 'vite-plus';
import viteReact from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const packageJson = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as { version: string };

const backendOrigin = `http://127.0.0.1:${process.env.DEVTOOLS_PORT ?? '14400'}`;
const backendProxy = (): ProxyOptions => ({
  target: backendOrigin,
  changeOrigin: true,
  configure(proxy) {
    proxy.on('proxyReq', (request) =>
      request.setHeader('origin', backendOrigin),
    );
  },
});

export default defineConfig({
  build: {
    outDir: 'dist/ui',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: fileURLToPath(new URL('./index.html', import.meta.url)),
        snapshot: fileURLToPath(new URL('./snapshot.html', import.meta.url)),
      },
    },
  },
  define: {
    __DEVTOOLS_VERSION__: JSON.stringify(packageJson.version),
  },
  resolve: {
    dedupe: [
      '@tanstack/db',
      '@tanstack/react-db',
      'effect',
      'react',
      'react-dom',
    ],
  },
  optimizeDeps: {
    // The source viewer loads these grammars lazily, per file type. Bundling
    // them up front stops a first JSON or CSS file from failing while Vite
    // re-optimizes mid-session.
    include: [
      'kui-toolkit > @shikijs/langs/css',
      'kui-toolkit > @shikijs/langs/html',
      'kui-toolkit > @shikijs/langs/javascript',
      'kui-toolkit > @shikijs/langs/json',
      'kui-toolkit > @shikijs/langs/jsx',
      'kui-toolkit > @shikijs/langs/markdown',
      'kui-toolkit > @shikijs/langs/tsx',
      'kui-toolkit > @shikijs/langs/typescript',
      'kui-toolkit > @shikijs/langs/yaml',
    ],
  },
  server: {
    host: true,
    // portless assigns PORT and forwards its Host headers during dev.
    port: Number(process.env.PORT ?? process.env.DEVTOOLS_UI_PORT ?? '5173'),
    strictPort: true,
    allowedHosts: ['.devtools.kishore.computer'],
    proxy: {
      '/health': backendProxy(),
      '/rpc': backendProxy(),
      '/v1': backendProxy(),
    },
  },
  plugins: [tailwindcss(), viteReact()],
  pack: {
    entry: {
      'server/main': 'src/server/main.ts',
    },
    format: 'esm',
    platform: 'node',
    dts: false,
    publint: false,
  },
  test: {
    environment: 'node',
  },
});
