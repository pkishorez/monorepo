import { defineConfig } from 'vitest/config';
import { pluginRelease } from './scripts/plugin-release.ts';

export default defineConfig({
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    passWithNoTests: true,
    setupFiles: ['./vitest.setup.ts'],
    // The Releases of the Plugins Code calls, as a build names them.
    env: {
      PLUGIN_CODE: pluginRelease('code', false),
      PLUGIN_FILES: pluginRelease('files', false),
    },
  },
});
