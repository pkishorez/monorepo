import { defineConfig } from 'vitest/config';
import { pluginCode } from './scripts/plugin-code.ts';

export default defineConfig({
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    passWithNoTests: true,
    setupFiles: ['./vitest.setup.ts'],
    // The Release of the code Plugin Code calls, as a build names it.
    env: { PLUGIN_CODE: pluginCode(false) },
  },
});
