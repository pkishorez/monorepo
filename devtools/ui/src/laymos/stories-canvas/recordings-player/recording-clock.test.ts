import { describe, expect, it } from 'vitest';
import type { Recording, Step } from 'laymos/story/schema';

import { clockRange, frameAt, stepAt } from './recording-clock';

const frames = [
  { at: 100, file: '0.jpg' },
  { at: 140, file: '1.jpg' },
  { at: 400, file: '2.jpg' },
];

const step = (name: string, startedAt: number, endedAt: number): Step => ({
  name,
  kind: 'click',
  tab: 'Tab 1',
  phase: 'act',
  startedAt,
  endedAt,
  passed: true,
  screenshot: null,
});

describe('frameAt', () => {
  it('shows nothing before the first frame', () => {
    expect(frameAt(frames, 99)).toBe(-1);
    expect(frameAt([], 500)).toBe(-1);
  });

  it('holds frame i while the clock is in [at i, at i+1)', () => {
    expect(frameAt(frames, 100)).toBe(0);
    expect(frameAt(frames, 139.9)).toBe(0);
    expect(frameAt(frames, 140)).toBe(1);
    expect(frameAt(frames, 399)).toBe(1);
    expect(frameAt(frames, 10_000)).toBe(2);
  });
});

describe('stepAt', () => {
  const steps = [step('open', 0, 100), step('click', 200, 300)];

  it('finds the Step under way, else the last one begun', () => {
    expect(stepAt(steps, 50)?.name).toBe('open');
    expect(stepAt(steps, 150)?.name).toBe('open');
    expect(stepAt(steps, 250)?.name).toBe('click');
    expect(stepAt(steps, 900)?.name).toBe('click');
  });

  it('finds none before the first Step', () => {
    expect(stepAt([step('late', 500, 600)], 100)).toBeUndefined();
  });
});

describe('clockRange', () => {
  it('spans every Recording and Step', () => {
    const recording: Recording = {
      tab: 'Tab 1',
      device: 'Desktop 1',
      deviceKind: 'desktop',
      viewport: { width: 1280, height: 800 },
      openedAt: 300,
      closedAt: 900,
      frames,
    };
    expect(clockRange([recording], [step('open', 250, 1200)])).toEqual({
      start: 100,
      end: 1200,
    });
    expect(clockRange([], [])).toEqual({ start: 0, end: 0 });
  });
});
