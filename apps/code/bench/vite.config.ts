import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/** The transcript bench, built as the app is, for production. */
export default defineConfig({
  root: import.meta.dirname,
  logLevel: 'warn',
  plugins: [tailwindcss(), react()],
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 4096 },
});
