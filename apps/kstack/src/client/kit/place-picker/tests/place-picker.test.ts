import { describe, expect, it } from 'vitest';
import { pick } from '../index.ts';
import { STEP } from '../steps.ts';

const FIRST = 40;
// Four items, from the second: Home, [Entries], Months, Settings.
const at = (travel: number, start = 1, count = 4) =>
  pick({ count, start, travel, first: FIRST });

describe('the Place Picker stepping through items by travel', () => {
  it('stays on the start short of the first Step', () => {
    expect(at(0)).toBe(1);
    expect(at(FIRST - 1)).toBe(1);
    expect(at(-(FIRST - 1))).toBe(1);
  });

  it('takes the first Step exactly at the first travel, either way', () => {
    expect(at(FIRST)).toBe(2);
    expect(at(-FIRST)).toBe(0);
  });

  it('takes one more Step for each further stretch', () => {
    expect(at(FIRST + STEP - 1)).toBe(2);
    expect(at(FIRST + STEP)).toBe(3);
    expect(at(-(FIRST + STEP), 3)).toBe(1);
  });

  it('counts back as the travel comes back toward the start', () => {
    expect(at(FIRST + STEP / 2)).toBe(2);
    expect(at(FIRST / 2)).toBe(1);
  });

  it('holds at either end and never wraps', () => {
    expect(at(-FIRST, 0)).toBe(0);
    expect(at(FIRST + STEP * 5)).toBe(3);
    expect(at(-(FIRST + STEP * 5))).toBe(0);
    expect(at(FIRST, 0, 1)).toBe(0);
  });
});
