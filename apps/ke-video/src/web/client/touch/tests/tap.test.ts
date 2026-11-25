import { describe, expect, it } from 'vitest';
import { DOUBLE_TAP_MS, doubles, isTap, sideOf, skipTo } from '../tap.ts';

describe('sideOf', () => {
  const [width, height] = [393, 221];

  it('is back on the left, forward on the right', () => {
    expect(sideOf(40, 110, width, height)).toBe('back');
    expect(sideOf(360, 110, width, height)).toBe('forward');
  });

  it('leaves the middle to play and pause', () => {
    expect(sideOf(196, 110, width, height)).toBeNull();
  });

  it("leaves the player's top buttons and bottom bar to it", () => {
    expect(sideOf(40, 20, width, height)).toBeNull();
    expect(sideOf(40, height - 20, width, height)).toBeNull();
  });
});

describe('doubles', () => {
  it('pairs two taps on one side, soon enough', () => {
    expect(doubles({ side: 'back', t: 0 }, { side: 'back', t: 200 })).toBe(
      true,
    );
    expect(
      doubles({ side: 'back', t: 0 }, { side: 'back', t: DOUBLE_TAP_MS }),
    ).toBe(true);
  });

  it('does not pair taps too far apart, on two sides, or with none before', () => {
    expect(
      doubles({ side: 'back', t: 0 }, { side: 'back', t: DOUBLE_TAP_MS + 1 }),
    ).toBe(false);
    expect(doubles({ side: 'back', t: 0 }, { side: 'forward', t: 100 })).toBe(
      false,
    );
    expect(doubles(null, { side: 'back', t: 100 })).toBe(false);
  });
});

describe('skipTo', () => {
  it('moves 10 s either way', () => {
    expect(skipTo(30, 'back', 100)).toBe(20);
    expect(skipTo(30, 'forward', 100)).toBe(40);
  });

  it('stays within the video', () => {
    expect(skipTo(4, 'back', 100)).toBe(0);
    expect(skipTo(95, 'forward', 100)).toBe(100);
    expect(skipTo(95, 'forward', Number.NaN)).toBe(105);
  });
});

describe('isTap', () => {
  it('is a short, still touch', () => {
    expect(isTap(0, 0, 80)).toBe(true);
    expect(isTap(6, 6, 200)).toBe(true);
  });

  it('is not a scroll or a hold', () => {
    expect(isTap(0, 40, 120)).toBe(false);
    expect(isTap(0, 0, 600)).toBe(false);
  });
});
