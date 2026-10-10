import { defineConfig } from 'vite-plus';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { pickServer } from './src/playground/pick-server.ts';

// The Playground: every Round's Prototypes side by side, with a Pick button.
export default defineConfig({
  server: { port: 5391, strictPort: true },
  plugins: [tailwindcss(), react(), pickServer()],
});
