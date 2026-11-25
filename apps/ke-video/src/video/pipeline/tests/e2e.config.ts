import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/** Runs the pipeline's end-to-end test, which `pnpm test` leaves out. */
export default defineConfig({
  root: fileURLToPath(new URL('../../../..', import.meta.url)),
  test: { include: ['src/video/pipeline/tests/*.e2e.test.ts'] },
});
