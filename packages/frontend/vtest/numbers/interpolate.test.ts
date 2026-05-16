import { expect } from 'vitest';

import { vdescribe, vtest } from '@monorepo/vtest';

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

const inverseLerp = (a: number, b: number, v: number): number =>
  (v - a) / (b - a);

vdescribe(
  'lerp',
  'Forward interpolation: given a parameter `t`, return the point that fraction of the way between `a` and `b`.',
  () => {
    vtest('exact endpoint identity at t=0 and t=1', 'Required by the monotonic form.', () => {
      expect(lerp(10, 20, 0)).toBe(10);
      expect(lerp(10, 20, 1)).toBe(20);
    });

    vtest('returns the midpoint at t=0.5', 'The simplest non-trivial case.', () => {
      expect(lerp(0, 100, 0.5)).toBe(50);
    });

    vtest(
      'extrapolates when t is outside [0,1]',
      '`lerp` does not clamp — `t = 1.5` returns the point a further half-step past `b`.',
      () => {
        expect(lerp(0, 100, 1.5)).toBe(150);
        expect(lerp(0, 100, -0.5)).toBe(-50);
      },
    );
  },
);

vdescribe(
  'inverseLerp',
  'Given a value `v`, recover the parameter `t` such that `lerp(a, b, t) === v`.',
  () => {
    vtest('round-trips lerp at a few sample points', '`inverseLerp ∘ lerp` is the identity on `t`.', () => {
      for (const t of [0, 0.25, 0.5, 0.75, 1]) {
        expect(inverseLerp(10, 20, lerp(10, 20, t))).toBeCloseTo(t);
      }
    });

    vtest(
      'returns 0 / 1 at the endpoints',
      'Sanity boundary check.',
      () => {
        expect(inverseLerp(10, 20, 10)).toBe(0);
        expect(inverseLerp(10, 20, 20)).toBe(1);
      },
    );
  },
);
