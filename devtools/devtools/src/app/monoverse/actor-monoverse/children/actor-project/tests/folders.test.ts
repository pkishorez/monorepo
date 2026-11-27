import { describe, expect, test } from 'vitest';

import { foldersHolding, isIgnored } from '../logic/shared/index.js';

describe('folders', () => {
  test('the folders holding some paths, so opening them shows those', () => {
    expect(foldersHolding('', ['packages/core', 'apps/web'])).toEqual([
      'apps',
      'packages',
    ]);
    expect(foldersHolding('pkg', ['pkg/src/a/x.ts', 'other/y.ts'])).toEqual([
      'pkg/src',
      'pkg/src/a',
    ]);
  });

  test('a path outside every Source root is ignored; the folders holding one are not', () => {
    const roots = ['pkg/src/app'];
    expect(isIgnored('pkg/src/app/x.ts', roots)).toBe(false);
    expect(isIgnored('pkg/src', roots)).toBe(false);
    expect(isIgnored('pkg/src/other.ts', roots)).toBe(true);
    expect(isIgnored('pkg/README.md', roots)).toBe(true);
    expect(isIgnored('pkg/README.md', null)).toBe(false);
  });
});
