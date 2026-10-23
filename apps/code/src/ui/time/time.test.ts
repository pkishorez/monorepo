import { describe, expect, it } from 'vitest';
import { ago, elapsed } from './time.ts';

describe('elapsed', () => {
  it('counts seconds, then minutes and seconds, then hours and minutes', () => {
    expect(elapsed(0)).toBe('0s');
    expect(elapsed(8_900)).toBe('8s');
    expect(elapsed(59_999)).toBe('59s');
    expect(elapsed(60_000)).toBe('1m 00s');
    expect(elapsed(245_000)).toBe('4m 05s');
    expect(elapsed(3_600_000)).toBe('1h 00m');
    expect(elapsed(7_380_000)).toBe('2h 03m');
  });

  it('never runs backwards from a clock ahead of this one', () => {
    expect(elapsed(-5_000)).toBe('0s');
  });
});

describe('ago', () => {
  it('says just now under 10 seconds, then counts seconds, then minutes', () => {
    expect(ago(0, 9_000)).toBe('just now');
    expect(ago(0, 40_000)).toBe('40 seconds ago');
    expect(ago(0, 60_000)).toBe('1 minute ago');
  });
});
