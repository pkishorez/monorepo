import { defineConfig } from 'vite-plus';

export default defineConfig({
  lint: {
    ignorePatterns: [
      'dist/**',
      '*.gen.ts',
      '**/std-toolkit/db-dynamodb/src/generated/**',
      '**/__tests__/fixtures/**',
      '**/test/fixtures/**',
      'platforms/web-platform/src/components/ui/**',
    ],
    overrides: [
      {
        // Kabuki apps keep state in Nodes and motion in the Frame. A
        // useEffect there needs a disable comment that says why.
        files: [
          'apps/alchemy-console/src/**',
          'apps/docs/src/client/demos/**',
          'apps/docs/src/client/docs/**',
          'apps/kabuki-start/src/**',
          'packages/kabuki/src/**',
        ],
        rules: {
          'no-restricted-imports': [
            'error',
            {
              paths: [
                {
                  name: 'react',
                  importNames: ['useEffect'],
                  message:
                    'Derive during render, use an event handler, useSyncExternalStore, a Lifetime, or useMotionValueEvent. If an effect is truly needed, disable this line and say why.',
                },
              ],
            },
          ],
        },
      },
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
      '**/__tests__/fixtures/**',
      '**/test/fixtures/**',
      'platforms/web-platform/src/components/ui/**',
      '**/package.json',
      'devtools/laymos/schema.json',
    ],
  },
  staged: {
    '*.{ts,tsx}': 'vp check --fix',
    '*.{json,md,css}': 'vp fmt --write --no-error-on-unmatched-pattern',
  },
});
