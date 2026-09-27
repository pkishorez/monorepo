// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import {
  coast,
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

describe('coast', () => {
  it('jumps to where friction would stop it, on a detent, for reduced motion', async () => {
    const values: Array<number> = [];
    const run = coast({
      from: 100,
      velocity: 0.1,
      snap: 30,
      instant: true,
      onUpdate: (value) => values.push(value),
    });
    await run.finished;
    // 100 + 0.8 × 100px/s = 180, nearest detent 180.
    expect(values).toEqual([180]);
  });

  it('stops at a bound instead of passing it', async () => {
    const values: Array<number> = [];
    await coast({
      from: 250,
      velocity: 2,
      max: 300,
      instant: true,
      onUpdate: (value) => values.push(value),
    }).finished;
    expect(values).toEqual([300]);
  });

  it('runs on with the release speed, slows, and rests on a detent', async () => {
    const values: Array<number> = [];
    await coast({
      from: 0,
      velocity: 0.3,
      snap: 50,
      instant: false,
      onUpdate: (value) => values.push(value),
    }).finished;
    expect(values.length).toBeGreaterThan(5);
    expect(values[1]).toBeGreaterThan(0);
    // 0.8 × 300px/s = 240, nearest detent 250.
    expect(values.at(-1)).toBeCloseTo(250, 0);
  });

  it('goes back to the bound it was released past, whatever the speed', async () => {
    const values: Array<number> = [];
    await coast({
      from: -40,
      velocity: -0.5,
      min: 0,
      max: 100,
      instant: true,
      onUpdate: (value) => values.push(value),
    }).finished;
    expect(values).toEqual([0]);
  });

  it('glides onto the nearest detent when released without speed', async () => {
    const values: Array<number> = [];
    await coast({
      from: 38,
      velocity: 0,
      snap: 25,
      instant: false,
      onUpdate: (value) => values.push(value),
    }).finished;
    expect(values.length).toBeGreaterThan(1);
    expect(values.at(-1)).toBeCloseTo(50, 0);
  });

  it('bounces back to a bound it runs past', async () => {
    const values: Array<number> = [];
    await coast({
      from: 0,
      velocity: 1,
      min: 0,
      max: 100,
      instant: false,
      onUpdate: (value) => values.push(value),
    }).finished;
    expect(Math.max(...values)).toBeGreaterThan(100);
    expect(values.at(-1)).toBeCloseTo(100, 0);
  });
});
