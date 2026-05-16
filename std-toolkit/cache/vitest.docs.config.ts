import { defineConfig } from 'vitest/config';

import { VTestReporter } from '@monorepo/vtest/reporter';

export default defineConfig({
  test: {
    include: ['vtest/**/*.test.ts'],
    includeTaskLocation: true,
    reporters: ['default', new VTestReporter({ root: 'vtest' })],
  },
});
