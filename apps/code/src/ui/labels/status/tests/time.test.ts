import { describe, expect, it } from 'vitest';
import { ago, elapsed, since } from '../time.ts';

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

describe('since', () => {
  it('says now under a minute, then the largest whole unit in a letter or two', () => {
    expect(since(0, 59_000)).toBe('now');
    expect(since(0, 60_000)).toBe('1m');
    expect(since(0, 3_599_000)).toBe('59m');
    expect(since(0, 3 * 3_600_000)).toBe('3h');
    expect(since(0, 2 * 86_400_000)).toBe('2d');
    expect(since(0, 15 * 86_400_000)).toBe('2w');
    expect(since(0, 61 * 86_400_000)).toBe('2mo');
    expect(since(0, 400 * 86_400_000)).toBe('1y');
  });

  it('says now for a time a clock ahead of this one puts later', () => {
    expect(since(5_000, 0)).toBe('now');
  });
});
