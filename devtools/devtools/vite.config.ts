import { readFileSync } from 'node:fs';
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
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
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
