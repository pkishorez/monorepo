import { describe, expect, it } from 'vitest';
import {
  commits,
  createVelocity,
  fingersMatch,
  lock,
  release,
} from '../swipe.ts';

describe('lock', () => {
  it('waits for the first few px', () => {
    expect(lock('down', { dx: 3, dy: 6 })).toBe('wait');
  });

  it('locks toward its direction and refuses any other', () => {
    expect(lock('down', { dx: 2, dy: 12 })).toBe('locked');
    expect(lock('down', { dx: 2, dy: -12 })).toBe('direction');
    expect(lock('down', { dx: 12, dy: 2 })).toBe('direction');
    expect(lock('left', { dx: -12, dy: 2 })).toBe('locked');
  });
});

describe('createVelocity', () => {
  it('measures px/s over the last 100ms', () => {
    const velocity = createVelocity();
    velocity.add(0, 0);
    velocity.add(50, 50);
    expect(velocity.at(50, 50)).toBe(1000);
  });

  it('falls to 0 while the fingers rest', () => {
    const velocity = createVelocity();
    velocity.add(0, 0);
    velocity.add(50, 50);
    expect(velocity.at(100, 50)).toBe(500);
    expect(velocity.at(151, 50)).toBe(0);
  });
});

describe('commits', () => {
  it('needs either the distance or the velocity', () => {
    const rule = { distance: 80, velocity: 500 };
    expect(commits(rule, 80, 0)).toBe(true);
    expect(commits(rule, 10, 600)).toBe(true);
    expect(commits(rule, 10, 100)).toBe(false);
    expect(commits({ velocity: 500 }, 1000, 0)).toBe(false);
  });
});

it('matches finger counts exactly or in a range', () => {
  expect(fingersMatch(2, 2)).toBe(true);
  expect(fingersMatch(2, 1)).toBe(false);
  expect(fingersMatch([1, 3], 3)).toBe(true);
});

it('projects momentum, never below 0', () => {
  expect(release(100, 1000).projected).toBe(250);
  expect(release(10, -1000).projected).toBe(0);
});
