import { expect } from 'vitest';

import { vdescribe, vtest } from '@monorepo/vtest';

const unique = <T, K = T>(
  xs: readonly T[],
  key: (x: T) => K = (x) => x as unknown as K,
): T[] => {
  const seen = new Set<K>();
  const out: T[] = [];
  for (const x of xs) {
    const k = key(x);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(x);
  }
  return out;
};

vdescribe(
  'identity key',
  'When no key function is given, elements are compared by `SameValueZero` (the same equality `Set` uses).',
  () => {
    vtest('removes duplicates in order of first occurrence', 'Order-preserving.', () => {
      expect(unique([1, 2, 1, 3, 2, 4])).toEqual([1, 2, 3, 4]);
    });

    vtest(
      'is case-sensitive for strings',
      '`"a"` and `"A"` are distinct under the default comparator.',
      () => {
        expect(unique(['a', 'A', 'a', 'B'])).toEqual(['a', 'A', 'B']);
      },
    );

    vtest('handles an empty input', 'Edge case.', () => {
      expect(unique<number>([])).toEqual([]);
    });
  },
);

vdescribe(
  'with a key function',
  'A key function maps each element to its identity bucket; the first element to land in a bucket wins.',
  () => {
    vtest(
      'collapses objects by id',
      'The canonical use case — merging two paginated result pages.',
      () => {
        const rows = [
          { id: 1, name: 'a' },
          { id: 2, name: 'b' },
          { id: 1, name: 'a-updated' },
        ];
        expect(unique(rows, (r) => r.id)).toEqual([
          { id: 1, name: 'a' },
          { id: 2, name: 'b' },
        ]);
      },
    );

    vtest(
      'allows case-insensitive string dedup',
      'Lowercasing the key folds `"a"` and `"A"` into the same bucket.',
      () => {
        expect(unique(['a', 'A', 'b'], (s) => s.toLowerCase())).toEqual([
          'a',
          'b',
        ]);
      },
    );
  },
);
