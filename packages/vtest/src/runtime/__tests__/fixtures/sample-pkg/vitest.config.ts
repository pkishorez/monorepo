import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const here = path.dirname(fileURLToPath(import.meta.url));
const authoring = path.resolve(
  here,
  '../../../../authoring/index.ts',
);

export default defineConfig({
  resolve: {
    alias: {
      '@monorepo/vtest': authoring,
    },
  },
});
