import { expect } from 'vitest';

import { vdescribe, vtest } from '@monorepo/vtest';

const chunk = <T>(xs: readonly T[], size: number): T[][] => {
  if (size <= 0) throw new RangeError('size must be > 0');
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) {
    out.push(xs.slice(i, i + size));
  }
  return out;
};

vdescribe(
  'evenly divisible',
  'When `xs.length % size === 0`, every chunk has the same length.',
  () => {
    vtest('splits into uniform pairs', 'Six items, size two.', () => {
      expect(chunk([1, 2, 3, 4, 5, 6], 2)).toEqual([
        [1, 2],
        [3, 4],
        [5, 6],
      ]);
    });

    vtest(
      'splits into uniform triples',
      'Same input, different chunk size.',
      () => {
        expect(chunk([1, 2, 3, 4, 5, 6], 3)).toEqual([
          [1, 2, 3],
          [4, 5, 6],
        ]);
      },
    );
  },
);

vdescribe(
  'remainder',
  'When `xs.length % size !== 0`, the final chunk is the leftover prefix.',
  () => {
    vtest(
      'final chunk shorter than size',
      'Five items, size two — final chunk has one element.',
      () => {
        expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
      },
    );

    vtest(
      'no item loss',
      'Property: the flattened chunks equal the original array.',
      () => {
        const xs = [10, 20, 30, 40, 50, 60, 70];
        for (const n of [1, 2, 3, 4, 5, 6, 7]) {
          expect(chunk(xs, n).flat()).toEqual(xs);
        }
      },
    );
  },
);

vdescribe(
  'degenerate inputs',
  'Empty arrays and invalid sizes.',
  () => {
    vtest('empty input → empty output', 'No work to do.', () => {
      expect(chunk([], 3)).toEqual([]);
    });

    vtest(
      'size larger than length',
      'Returns a single chunk containing the whole array.',
      () => {
        expect(chunk([1, 2, 3], 10)).toEqual([[1, 2, 3]]);
      },
    );

    vtest('size <= 0 throws', '`size` is a positive integer.', () => {
      expect(() => chunk([1, 2, 3], 0)).toThrow(RangeError);
      expect(() => chunk([1, 2, 3], -1)).toThrow(RangeError);
    });
  },
);
