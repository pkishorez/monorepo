import { describe, expect, it } from 'vitest';
import { isUnseen } from '../unseen.ts';

describe('Unseen', () => {
  it('is a Session whose last Turn ended after its mark', () => {
    const marks = { s1: 20, s2: 0 };
    expect(isUnseen(marks, 's1', 30)).toBe(true);
    expect(isUnseen(marks, 's1', 20)).toBe(false);
    expect(isUnseen(marks, 's2', null)).toBe(false);
    expect(isUnseen(marks, 'never-opened', 30)).toBe(false);
  });
});
