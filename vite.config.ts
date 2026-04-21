import { defineConfig } from 'vite-plus';

export default defineConfig({
  lint: {
    ignorePatterns: [
      'dist/**',
      '*.gen.ts',
      'whatever-code/src/codex/generated/**',
      '**/__tests__/fixtures/**',
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
      'whatever-code/src/codex/generated/**',
      '**/__tests__/fixtures/**',
    ],
  },
  staged: {
    '*.{ts,tsx}': 'vp check --fix',
    '*.{json,md,css}': 'vp fmt --write',
  },
});
