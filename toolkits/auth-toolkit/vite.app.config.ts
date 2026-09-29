import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Builds the Auth Worker app into dist/auth-worker/app. Dependencies stay external so the
// alchemy resource's own bundler resolves them for workerd, from this
// package's node_modules; ui-toolkit ships raw source and is inlined here.
export default defineConfig({
  build: {
    outDir: 'dist/auth-worker/app',
    emptyOutDir: false,
    rolldownOptions: { external: ['cloudflare:workers'] },
  },
  ssr: {
    noExternal: ['@kstackz/ui-toolkit'],
    resolve: { mainFields: ['browser', 'module', 'jsnext:main', 'jsnext'] },
  },
  plugins: [
    tailwindcss(),
    tanstackStart({
      srcDirectory: 'src/auth-worker/app',
      router: {
        indexToken: 'page',
        routeToken: 'layout',
        routeFileIgnorePattern: '^(components|internal)$',
      },
    }),
    react(),
  ],
});
