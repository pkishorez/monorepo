import { expect, it } from 'vitest';
import { directionOf, wants } from '../direction.ts';

it('reads the way a movement went most, vertical on a tie', () => {
  expect(directionOf(0, 0)).toBeUndefined();
  expect(directionOf(2, 12)).toBe('down');
  expect(directionOf(2, -12)).toBe('up');
  expect(directionOf(-12, 2)).toBe('left');
  expect(directionOf(12, -2)).toBe('right');
  expect(directionOf(5, 5)).toBe('down');
});

it('wants a listed Direction, or every one with all', () => {
  expect(wants(['left'], 'left')).toBe(true);
  expect(wants(['left'], 'up')).toBe(false);
  expect(wants('all', 'up')).toBe(true);
  expect(wants(undefined, 'up')).toBe(false);
  expect(wants('all', undefined)).toBe(false);
});
