import { describe, expect, it } from 'vitest';
import { pick } from '../index.ts';
import { STEP } from '../steps.ts';

const FIRST = 72;
// Four items, from the second: Home, [Entries], Months, Settings.
const at = (travel: number, start = 1, count = 4) =>
  pick({ count, start, travel, first: FIRST });

describe('the Place Picker stepping through items by travel', () => {
  it('takes no Step short of the first', () => {
    expect(at(0)).toEqual({ steps: 0, index: 1, past: false });
    expect(at(FIRST - 1)).toEqual({ steps: 0, index: 1, past: false });
    expect(at(-(FIRST - 1))).toEqual({ steps: 0, index: 1, past: false });
  });

  it('takes the first Step exactly at the first travel, either way', () => {
    expect(at(FIRST)).toEqual({ steps: 1, index: 2, past: false });
    expect(at(-FIRST)).toEqual({ steps: -1, index: 0, past: false });
  });

  it('takes one more Step for each further stretch', () => {
    expect(at(FIRST + STEP - 1)).toMatchObject({ steps: 1, index: 2 });
    expect(at(FIRST + STEP)).toMatchObject({ steps: 2, index: 3 });
    expect(at(-(FIRST + STEP), 3)).toMatchObject({ steps: -2, index: 1 });
  });

  it('counts back down as the travel comes back toward the start', () => {
    expect(at(FIRST + STEP)).toMatchObject({ steps: 2 });
    expect(at(FIRST + STEP / 2)).toMatchObject({ steps: 1 });
    expect(at(FIRST / 2)).toMatchObject({ steps: 0, index: 1 });
  });

  it('holds at either end, and says when the Steps went past it', () => {
    expect(at(-FIRST, 0)).toEqual({ steps: -1, index: 0, past: true });
    expect(at(FIRST, 3)).toEqual({ steps: 1, index: 3, past: true });
    expect(at(FIRST + STEP * 5)).toEqual({ steps: 6, index: 3, past: true });
    expect(at(-(FIRST + STEP * 5))).toEqual({
      steps: -6,
      index: 0,
      past: true,
    });
  });

  it('reaches the very end without going past it', () => {
    expect(at(FIRST + STEP)).toEqual({ steps: 2, index: 3, past: false });
  });

  it('never wraps around, with a single item', () => {
    expect(at(FIRST, 0, 1)).toEqual({ steps: 1, index: 0, past: true });
    expect(at(-FIRST, 0, 1)).toEqual({ steps: -1, index: 0, past: true });
  });
});
