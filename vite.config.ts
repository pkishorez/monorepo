import { defineConfig } from 'vite-plus';

export default defineConfig({
  lint: {
    ignorePatterns: [
      'dist/**',
      '*.gen.ts',
      '**/std-toolkit/db-dynamodb/src/generated/**',
      'whatever-code/src/codex/generated/**',
      '**/__tests__/fixtures/**',
      'packages/frontend/src/components/ui/**',
      'packages/frontend/vtest/**',
    ],
  },
  fmt: {
    printWidth: 80,
    tabWidth: 2,
    semi: true,
    singleQuote: true,
    ignorePatterns: [
      'dist/**',
      '*.gen.ts',
      '**/std-toolkit/db-dynamodb/src/generated/**',
      'whatever-code/src/codex/generated/**',
      '**/__tests__/fixtures/**',
      'packages/frontend/src/components/ui/**',
      'packages/frontend/vtest/**',
    ],
  },
  staged: {
    '*.{ts,tsx}': 'vp check --fix',
    '*.{json,md,css}': 'vp fmt --write',
    'packages/frontend/{src,vtest}/**': 'pnpm --filter @monorepo/frontend docs',
    'std-toolkit/db-dynamodb/{src,vtest}/**':
      'pnpm --filter @std-toolkit/db-dynamodb docs',
  },
});
