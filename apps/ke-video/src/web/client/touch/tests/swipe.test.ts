import { describe, expect, it } from 'vitest';
import {
  ACTION_WIDTH,
  besideOf,
  inGutter,
  ROW_FLICK,
  rowAt,
  rowOpens,
  TAB_FLICK,
  tabAfter,
} from '../swipe.ts';

const TABS = ['transcript', 'summary', 'cuts'] as const;

describe('inGutter', () => {
  it('is the 20 px along each side edge', () => {
    expect(inGutter(0, 393)).toBe(true);
    expect(inGutter(19, 393)).toBe(true);
    expect(inGutter(20, 393)).toBe(false);
    expect(inGutter(196, 393)).toBe(false);
    expect(inGutter(373, 393)).toBe(false);
    expect(inGutter(374, 393)).toBe(true);
  });
});

describe('besideOf', () => {
  it('names the tabs on either side, none past the ends', () => {
    expect(besideOf(TABS, 'transcript')).toEqual({
      before: null,
      after: 'summary',
    });
    expect(besideOf(TABS, 'summary')).toEqual({
      before: 'transcript',
      after: 'cuts',
    });
    expect(besideOf(TABS, 'cuts')).toEqual({ before: 'summary', after: null });
  });
});

describe('tabAfter', () => {
  const width = 400;
  const slow = (offset: number) => ({ offset, velocity: 0 });

  it('opens the next tab swiping left past a quarter of the width', () => {
    expect(tabAfter(TABS, 'transcript', 'left', slow(100), width)).toBe(
      'summary',
    );
    expect(tabAfter(TABS, 'summary', 'left', slow(140), width)).toBe('cuts');
  });

  it('opens the one before swiping right', () => {
    expect(tabAfter(TABS, 'cuts', 'right', slow(120), width)).toBe('summary');
  });

  it('stays on a short, slow swipe', () => {
    expect(tabAfter(TABS, 'transcript', 'left', slow(99), width)).toBe(
      'transcript',
    );
  });

  it('goes on a short flick', () => {
    expect(
      tabAfter(
        TABS,
        'transcript',
        'left',
        { offset: 30, velocity: TAB_FLICK },
        width,
      ),
    ).toBe('summary');
  });

  it('stays past the ends however far it goes', () => {
    expect(tabAfter(TABS, 'transcript', 'right', slow(300), width)).toBe(
      'transcript',
    );
    expect(
      tabAfter(TABS, 'cuts', 'left', { offset: 300, velocity: 2000 }, width),
    ).toBe('cuts');
  });

  it('steps one tab at a time', () => {
    expect(tabAfter(TABS, 'transcript', 'left', slow(800), width)).toBe(
      'summary',
    );
  });
});

describe('rowAt', () => {
  const width = ACTION_WIDTH * 2;

  it('follows the finger between closed and open', () => {
    expect(rowAt(0, -50, width)).toBe(-50);
    expect(rowAt(-width, 40, width)).toBe(-width + 40);
  });

  it('never goes right of closed', () => {
    expect(rowAt(0, 30, width)).toBe(0);
    expect(rowAt(-width, width + 30, width)).toBe(0);
  });

  it('slows past its actions', () => {
    expect(rowAt(0, -width - 100, width)).toBe(-width - 25);
  });
});

describe('rowOpens', () => {
  const width = ACTION_WIDTH * 2;

  it('opens let go past half its actions', () => {
    expect(rowOpens(-width / 2 - 1, 0, width)).toBe(true);
    expect(rowOpens(-width / 2 + 1, 0, width)).toBe(false);
  });

  it('a flick left opens it and a flick right closes it, wherever it is', () => {
    expect(rowOpens(-10, -ROW_FLICK, width)).toBe(true);
    expect(rowOpens(-width, ROW_FLICK, width)).toBe(false);
  });
});
