import { describe, expect, it } from 'vitest';
import {
  COMMIT_PROGRESS,
  FLICK_VELOCITY,
  rubberBand,
  settle,
  shouldCommit,
} from './gestures';

describe('shouldCommit', () => {
  it('commits a slow release past 40% of the travel, and only past it', () => {
    expect(shouldCommit({ progress: 0.41, velocity: 0 })).toBe(true);
    expect(shouldCommit({ progress: COMMIT_PROGRESS, velocity: 0 })).toBe(
      false,
    );
    expect(shouldCommit({ progress: 0.2, velocity: 0.29 })).toBe(false);
  });

  it('lets a flick decide by its direction, whatever the distance', () => {
    expect(shouldCommit({ progress: 0.05, velocity: FLICK_VELOCITY })).toBe(
      true,
    );
    expect(shouldCommit({ progress: 0.9, velocity: -FLICK_VELOCITY })).toBe(
      false,
    );
  });
});

describe('rubberBand', () => {
  it('gives ground slower than the finger and never reaches the dimension', () => {
    expect(rubberBand(0, 300)).toBe(0);
    const small = rubberBand(50, 300);
    const large = rubberBand(5000, 300);
    expect(small).toBeGreaterThan(0);
    expect(small).toBeLessThan(50);
    expect(large).toBeLessThan(300);
    expect(large).toBeGreaterThan(small);
  });
});

describe('settle', () => {
  it('jumps straight to rest for reduced motion', async () => {
    const values: Array<number> = [];
    const run = settle({
      from: 120,
      to: 0,
      velocity: 1,
      instant: true,
      onUpdate: (value) => values.push(value),
    });
    await run.finished;
    expect(values).toEqual([0]);
  });
});
