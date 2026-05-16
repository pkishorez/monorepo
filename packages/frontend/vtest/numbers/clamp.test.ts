import { expect } from 'vitest';

import { vdescribe, vtest } from '@monorepo/vtest';

const clamp = (n: number, lo: number, hi: number): number =>
  Math.min(Math.max(n, lo), hi);

vdescribe(
  'in range',
  'Values that already lie inside `[lo, hi]` pass through unchanged.',
  () => {
    vtest('identity for interior values', 'No-op when the value is interior.', () => {
      expect(clamp(5, 0, 10)).toBe(5);
    });

    vtest(
      'identity at the endpoints',
      'Both endpoints are inclusive — clamping at the boundary is a no-op.',
      () => {
        expect(clamp(0, 0, 10)).toBe(0);
        expect(clamp(10, 0, 10)).toBe(10);
      },
    );
  },
);

vdescribe(
  'out of range',
  'Out-of-range values are pulled to the nearest endpoint.',
  () => {
    vtest('clamps below `lo`', 'Negative example.', () => {
      expect(clamp(-3, 0, 10)).toBe(0);
    });

    vtest('clamps above `hi`', 'Above-bound example.', () => {
      expect(clamp(42, 0, 10)).toBe(10);
    });
  },
);

vdescribe(
  'special values',
  'How non-finite inputs flow through the function.',
  () => {
    vtest(
      'NaN propagates',
      '`Math.min(NaN, ...)` is `NaN`, so the result is `NaN` for any clamp range.',
      () => {
        expect(clamp(Number.NaN, 0, 1)).toBeNaN();
      },
    );

    vtest(
      'Infinity is clamped',
      '`+Infinity` becomes `hi`; `-Infinity` becomes `lo`.',
      () => {
        expect(clamp(Number.POSITIVE_INFINITY, 0, 1)).toBe(1);
        expect(clamp(Number.NEGATIVE_INFINITY, 0, 1)).toBe(0);
      },
    );
  },
);
