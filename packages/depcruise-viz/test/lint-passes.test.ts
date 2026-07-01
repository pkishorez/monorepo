import { describe, expect, test } from 'vitest';

import { lintPasses } from '../src/cli/run.js';

const empty = { violations: [], closureViolations: [] };

describe('lintPasses', () => {
  test('returns true when both arrays are empty', () => {
    expect(lintPasses(empty)).toBe(true);
  });

  test('returns false when layer violations exist', () => {
    expect(
      lintPasses({
        ...empty,
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
      }),
    ).toBe(false);
  });

  test('returns false when closure violations exist', () => {
    expect(
      lintPasses({
        ...empty,
        closureViolations: [
          {
            reason: 'unclaimed-edge',
            feature: 'A',
            fromModule: 'x',
            toModule: 'w',
            detail: 'x → w not claimed by any feature',
          },
        ],
      }),
    ).toBe(false);
  });

  test('returns false when both violation types exist', () => {
    expect(
      lintPasses({
        violations: [
          {
            from: 'ui',
            to: 'data',
            fromFile: 'a.ts',
            toFile: 'b.ts',
            rule: 'r',
            severity: 'error',
          },
        ],
        closureViolations: [
          { reason: 'multi-root', feature: 'B', detail: 'multiple roots' },
        ],
      }),
    ).toBe(false);
  });
});
