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

const packed = (entry: Record<string, string>) => ({
  entry,
  format: 'esm' as const,
  platform: 'node' as const,
  minify: true,
  shims: true,
  dts: false,
  publint: false,
  outputOptions: { inlineDynamicImports: true },
  deps: {
    alwaysBundle: [/./],
    neverBundle: [/^@kestack\/monoverse/, /^tsx/],
    onlyBundle: false as const,
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
    port: Number(process.env.PORT ?? process.env.DEVTOOLS_UI_PORT ?? '5173'),
    strictPort: true,
    allowedHosts: true,
    proxy: {
      '/health': backendProxy(),
      '/rpc': backendProxy(),
      '/v1': backendProxy({ anyOrigin: true }),
      '^/kabuki/(sessions|session/)': { ...backendProxy(), ws: true },
    },
  },
  plugins: [tailwindcss(), viteReact()],
  pack: [
    packed({ 'cli/main': 'src/cli/main.ts' }),
    {
      ...packed({
        'cli/monoverse-engine':
          'src/app/monoverse/server/rpc/project/real/engine-worker.ts',
      }),
      clean: false,
    },
  ],
  test: {
    environment: 'node',
  },
});
