import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    // Accept the Host headers the portless proxy forwards during dev.
    allowedHosts: ['.kstack.kishore.computer'],
  },
  build: {
    rolldownOptions: { external: ['cloudflare:workers'] },
  },
  ssr: {
    noExternal: ['@kstackz/ui-toolkit'],
    resolve: {
      mainFields: ['browser', 'module', 'jsnext:main', 'jsnext'],
    },
  },
  plugins: [
    tailwindcss(),
    tanstackStart({
      // An Example keeps its components, hooks and helpers beside its routes.
      router: { routeFileIgnorePattern: '^(components|hooks|lib)$' },
    }),
    react(),
  ],
});
