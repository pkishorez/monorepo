import { describe, expect, it } from 'vitest';
import { howOf } from '../shape/shape.ts';

describe('howOf', () => {
  // A click as Base UI hands it, with the pointer that made it.
  const click = (pointerType: string) => ({ pointerType }) as unknown as Event;

  it('reads the pointer that clicked', () => {
    expect(howOf(click('mouse'))).toBe('mouse');
    expect(howOf(click('touch'))).toBe('touch');
    expect(howOf(click('pen'))).toBe('touch');
  });

  it('reads any click as a touch on a device with no keyboard and no mouse', () => {
    expect(howOf(click('mouse'), true)).toBe('touch');
    expect(howOf(undefined, true)).toBe('touch');
  });
});
