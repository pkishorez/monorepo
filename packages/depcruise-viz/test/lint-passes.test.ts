import { describe, expect, test } from 'vitest';

import { lintPasses } from '../src/cli/run.js';

describe('lintPasses', () => {
  test('returns true when there are no violations', () => {
    expect(
      lintPasses({ violations: [], moduleOverlaps: [], moduleViolations: [] }),
    ).toBe(true);
  });

  test('returns false when layer violations exist', () => {
    expect(
      lintPasses({
        violations: [
          {
            from: 'ui',
            to: 'data',
            fromFile: 'src/ui/index.ts',
            toFile: 'src/data/index.ts',
            rule: 'no-cross-layer',
            severity: 'error',
          },
        ],
        moduleOverlaps: [],
        moduleViolations: [],
      }),
    ).toBe(false);
  });

  test('returns false when module declarations overlap', () => {
    expect(
      lintPasses({
        violations: [],
        moduleOverlaps: [
          {
            outerPath: 'src/routes/dev',
            outerLayer: 'routes',
            outerName: 'dev',
            innerPath: 'src/routes/dev/components',
            innerLayer: 'routes',
            innerName: 'dev/components',
          },
        ],
        moduleViolations: [],
      }),
    ).toBe(false);
  });

  test('returns false when module rules are violated', () => {
    expect(
      lintPasses({
        violations: [],
        moduleOverlaps: [],
        moduleViolations: [
          {
            module: 'db',
            rule: 'root',
            from: 'ui',
            to: 'db',
            fromFile: 'src/ui/index.ts',
            toFile: 'src/db/index.ts',
          },
        ],
      }),
    ).toBe(false);
  });
});
