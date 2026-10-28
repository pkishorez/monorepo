import { describe, expect, it } from 'vitest';
import { leaving } from '../touch.ts';

/*
 * What focus leaving the Touch Draft's words does. iOS gives a tapped
 * button no focus: tapping the model chip or Add while typing leaves focus
 * with no one, as a tap outside does, and only whether the press under way
 * began in the card tells them apart.
 */

const editing = {
  editing: true,
  moving: false,
  within: false,
  pressing: false,
  smart: false,
};

describe('focus leaving the Touch Draft', () => {
  it('keeps it open, typing done, for a press on its own button on iOS, which takes no focus', () => {
    expect(leaving({ ...editing, pressing: true })).toBe('Done');
  });

  it('does nothing when focus goes to its own button, as in Chrome', () => {
    expect(leaving({ ...editing, within: true })).toBeNull();
  });

  it('collapses it for a press outside, or the keyboard put away', () => {
    expect(leaving(editing)).toBe('Collapse');
  });

  it('keeps it open with Smart Input, wherever the press was', () => {
    expect(leaving({ ...editing, smart: true })).toBe('Done');
  });

  it('does nothing while not editing, or when it moves the focus itself', () => {
    expect(leaving({ ...editing, editing: false })).toBeNull();
    expect(leaving({ ...editing, moving: true, pressing: true })).toBeNull();
  });
});
