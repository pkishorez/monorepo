import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Builds the Auth Worker app into dist/worker/app. Dependencies stay external so the
// alchemy resource's own bundler resolves them for workerd, from this
// package's node_modules. The pages' UI packages are dev dependencies, so they
// are inlined here instead.
export default defineConfig({
  build: {
    outDir: 'dist/worker/app',
    emptyOutDir: false,
    rolldownOptions: { external: ['cloudflare:workers'] },
  },
  ssr: {
    noExternal: [
      '@base-ui/react',
      'class-variance-authority',
      'clsx',
      'cn',
      'lucide-react',
      'motion',
      'sonner',
      'tailwind-merge',
    ],
    resolve: { mainFields: ['browser', 'module', 'jsnext:main', 'jsnext'] },
  },
  plugins: [
    tailwindcss(),
    tanstackStart({
      srcDirectory: 'src/worker/app',
      router: {
        indexToken: 'page',
        routeToken: 'layout',
        routeFileIgnorePattern: '^(components|internal)$',
      },
    }),
    react(),
  ],
});
