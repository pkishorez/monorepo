import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, type ProxyOptions } from 'vite-plus';
import viteReact from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { isTrustedOrigin } from './scripts/dev-proxy.js';

const packageJson = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as { version: string };

const backendOrigin = `http://127.0.0.1:${process.env.DEVTOOLS_PORT ?? '14400'}`;
// Every request leaves as from the server's own origin, so one from another
// page is refused here, before it is rewritten. OTLP takes any origin.
const backendProxy = ({ anyOrigin = false } = {}): ProxyOptions => ({
  target: backendOrigin,
  changeOrigin: true,
  bypass: (request) =>
    anyOrigin || isTrustedOrigin(request.headers) ? undefined : false,
  configure(proxy) {
    proxy.on('proxyReq', (request) =>
      request.setHeader('origin', backendOrigin),
    );
    proxy.on('proxyReqWs', (request) =>
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
      '@kestack/web-platform > @shikijs/langs/css',
      '@kestack/web-platform > @shikijs/langs/html',
      '@kestack/web-platform > @shikijs/langs/javascript',
      '@kestack/web-platform > @shikijs/langs/json',
      '@kestack/web-platform > @shikijs/langs/jsx',
      '@kestack/web-platform > @shikijs/langs/markdown',
      '@kestack/web-platform > @shikijs/langs/tsx',
      '@kestack/web-platform > @shikijs/langs/typescript',
      '@kestack/web-platform > @shikijs/langs/yaml',
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
      '/story-evidence': backendProxy(),
      '/v1': backendProxy({ anyOrigin: true }),
      // The /kabuki page's WebSockets; the page itself stays with Vite.
      '^/kabuki/(sessions|session/)': { ...backendProxy(), ws: true },
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
