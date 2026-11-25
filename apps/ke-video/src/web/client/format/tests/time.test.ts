import { describe, expect, it } from 'vitest';
import { clock, lineAt, span, timeOfDay } from '../time.ts';

describe('clock', () => {
  it('writes minutes and seconds, and hours from an hour on', () => {
    expect(clock(0)).toBe('0:00');
    expect(clock(39.4)).toBe('0:39');
    expect(clock(61)).toBe('1:01');
    expect(clock(3600)).toBe('1:00:00');
    expect(clock(7211)).toBe('2:00:11');
  });

  it('never goes below zero', () => {
    expect(clock(-3)).toBe('0:00');
  });
});

describe('span', () => {
  it('says short lengths in seconds', () => {
    expect(span(0.6)).toBe('0.6 s');
    expect(span(12.4)).toBe('12 s');
    expect(span(200)).toBe('3:20');
  });
});

describe('timeOfDay', () => {
  it('is the local time of the moment', () => {
    const at = new Date(2026, 10, 25, 9, 5, 7);
    expect(timeOfDay(at.toISOString())).toBe('09:05:07');
  });
});

describe('lineAt', () => {
  const lines = [
    { start: 0, end: 4 },
    { start: 4, end: 8 },
    { start: 10, end: 12 },
  ];

  it('is -1 before the first line, or with none', () => {
    expect(lineAt([], 3)).toBe(-1);
    expect(lineAt([{ start: 1 }], 0.5)).toBe(-1);
  });

  it('is the last line started by then', () => {
    expect(lineAt(lines, 0)).toBe(0);
    expect(lineAt(lines, 3.99)).toBe(0);
    expect(lineAt(lines, 4)).toBe(1);
    expect(lineAt(lines, 11)).toBe(2);
    expect(lineAt(lines, 500)).toBe(2);
  });

  it('keeps the line before through a gap', () => {
    expect(lineAt(lines, 9)).toBe(1);
  });
});
