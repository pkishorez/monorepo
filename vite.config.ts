import { defineConfig } from 'vite-plus';

export default defineConfig({
  lint: {
    ignorePatterns: [
      'dist/**',
      '*.gen.ts',
      '**/std-toolkit/db-dynamodb/src/generated/**',
      'whatever-code/src/codex/generated/**',
      '**/__tests__/fixtures/**',
      '**/test/fixtures/**',
      'packages/frontend/src/components/ui/**',
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
      '**/test/fixtures/**',
      'packages/frontend/src/components/ui/**',
      '**/package.json',
    ],
  },
  staged: {
    '*.{ts,tsx}': 'vp check --fix',
    '*.{json,md,css}': 'vp fmt --write --no-error-on-unmatched-pattern',
  },
});
