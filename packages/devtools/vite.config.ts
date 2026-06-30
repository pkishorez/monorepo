import { defineConfig } from 'vite-plus';

export default defineConfig({
  pack: {
    entry: {
      'server/main': 'src/server/main.ts',
    },
    format: 'esm',
    platform: 'node',
    dts: false,
    publint: false,
    deps: {
      alwaysBundle: [/depcruise-viz/, /@kishorez\/lotel/, /std-toolkit/],
    },
  },
});
