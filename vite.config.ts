import { defineConfig } from 'vite-plus';
import { kabuki } from './devtools/lint/src/presets/index.ts';

export default defineConfig({
  lint: {
    // Loaded from source, so linting never waits on a build.
    jsPlugins: ['./devtools/lint/src/index.ts'],
    ignorePatterns: [
      '.claude/worktrees/**',
      'dist/**',
      '*.gen.ts',
      '**/std-toolkit/db-dynamodb/src/generated/**',
      '**/__tests__/fixtures/**',
      '**/test/fixtures/**',
      'platforms/web-platform/src/ui/components/primitives/*.tsx',
    ],
    overrides: [
      {
        // The Kestack folder rules, on the first app that follows them.
        files: ['devtools/devtools/src/app/**'],
        rules: kabuki,
      },
      {
        // Kabuki apps keep state in Nodes and motion in the Frame. A
        // useEffect there needs a disable comment that says why.
        files: [
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
      '.claude/worktrees/**',
      'dist/**',
      '*.gen.ts',
      '**/std-toolkit/db-dynamodb/src/generated/**',
      '**/__tests__/fixtures/**',
      '**/test/fixtures/**',
      'platforms/web-platform/src/ui/components/primitives/*.tsx',
      '**/package.json',
      'devtools/laymos/schema.json',
    ],
  },
  staged: {
    '*.{ts,tsx}': 'vp check --fix',
    '*.{json,md,css}': 'vp fmt --write --no-error-on-unmatched-pattern',
  },
});
