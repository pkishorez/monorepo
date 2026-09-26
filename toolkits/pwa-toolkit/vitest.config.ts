import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const fixture = (name: string) =>
  fileURLToPath(new URL(`./test/${name}.ts`, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      'virtual:pwa-toolkit/build': fixture('virtual-build'),
      'virtual:pwa-toolkit/client': fixture('virtual-client'),
    },
  },
});
