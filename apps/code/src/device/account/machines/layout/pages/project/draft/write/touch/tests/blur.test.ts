import { describe, expect, it } from 'vitest';
import { leaving } from '../touch.ts';

/*
 * What focus leaving the Touch Draft's words does. iOS gives a tapped
 * button no focus: tapping the model chip, Add or Send while typing
 * leaves focus with no one, as a tap outside does, and only where the
 * press began tells them apart.
 */

const editing = {
  editing: true,
  moving: false,
  within: false,
  pressedWithin: false,
  smart: false,
};

describe('focus leaving the Touch Draft', () => {
  it('keeps it open for a tap on its own button on iOS, which takes no focus', () => {
    expect(leaving({ ...editing, pressedWithin: true })).toBe('Done');
  });

  it('does nothing when focus goes to its own button, as in Chrome', () => {
    expect(leaving({ ...editing, within: true })).toBeNull();
  });

  it('collapses it for a tap outside, or the keyboard put away', () => {
    expect(leaving(editing)).toBe('Collapse');
  });

  it('keeps it open with Smart Input, wherever the tap was', () => {
    expect(leaving({ ...editing, smart: true })).toBe('Done');
  });

  it('does nothing while not editing, or when it moves the focus itself', () => {
    expect(leaving({ ...editing, editing: false })).toBeNull();
    expect(
      leaving({ ...editing, moving: true, pressedWithin: true }),
    ).toBeNull();
  });
});
