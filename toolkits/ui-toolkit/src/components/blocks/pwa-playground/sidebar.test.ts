import { describe, expect, it } from 'vitest';
import { scrimTakesTaps } from './sidebar';

describe('scrimTakesTaps', () => {
  it('takes taps once open, even after springing back from past 1', () => {
    expect(scrimTakesTaps(1, -0.4)).toBe(true);
    expect(scrimTakesTaps(1.08, -2)).toBe(true);
  });

  it('takes taps while opening and lets them through while closing', () => {
    expect(scrimTakesTaps(0.5, 3)).toBe(true);
    expect(scrimTakesTaps(0.5, -3)).toBe(false);
    expect(scrimTakesTaps(0.01, 3)).toBe(false);
  });
});
