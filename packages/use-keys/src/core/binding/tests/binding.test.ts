import { describe as group, expect, it } from 'vitest';
import { conflicts, describe, sequence, shortcut } from '../index.ts';

const none = { mod: false, ctrl: false, alt: false, shift: false, meta: false };

group('shortcut', () => {
  it('gives the same value from a string or an object', () => {
    expect(shortcut('mod+k')).toEqual({
      type: 'shortcut',
      key: 'k',
      ...none,
      mod: true,
    });
    expect(shortcut({ key: 'k', mod: true })).toEqual(shortcut('mod+k'));
    expect(shortcut('ctrl+alt+shift+ArrowDown')).toEqual({
      type: 'shortcut',
      key: 'ArrowDown',
      ...none,
      ctrl: true,
      alt: true,
      shift: true,
    });
  });

  it('reads a trailing + as the plus key', () => {
    expect(shortcut('mod++').key).toBe('+');
    expect(shortcut('+').key).toBe('+');
  });

  it('refuses a modifier it does not know', () => {
    expect(() => shortcut('cmd+k' as 'mod+k')).toThrow('no modifier "cmd"');
  });
});

group('sequence', () => {
  it('gives the same value from a string or its steps', () => {
    expect(sequence('g g')).toEqual({
      type: 'sequence',
      steps: [shortcut('g'), shortcut('g')],
    });
    expect(sequence(['mod+k', { key: 's', mod: true }])).toEqual(
      sequence('mod+k mod+s'),
    );
  });

  it('is written back as people write it', () => {
    expect(describe(sequence('g g'))).toBe('g g');
    expect(describe(shortcut({ key: 'k', shift: 'left', ctrl: true }))).toBe(
      'ctrl+shift(left)+k',
    );
  });
});

group('conflicts', () => {
  it('finds keys that are the same as, or the start of, another', () => {
    expect(conflicts(shortcut('g'), sequence('g g'), false)).toBe(true);
    expect(conflicts(sequence('g i'), sequence('g j'), false)).toBe(false);
    expect(conflicts(shortcut('mod+k'), shortcut('ctrl+k'), false)).toBe(true);
    expect(conflicts(shortcut('mod+k'), shortcut('ctrl+k'), true)).toBe(false);
  });
});

// Types only: these lines fail to compile when the notation is wrong.
export const typed = () => {
  // @ts-expect-error a modifier it does not know
  shortcut('cmd+k');
  // @ts-expect-error modifiers out of order
  shortcut('shift+mod+k');
  // @ts-expect-error a symbol takes no shift
  shortcut('shift+?');
  // @ts-expect-error a Sequence has two steps or more
  sequence('g');
  // @ts-expect-error a step that is no Shortcut
  sequence('g cmd+k');
  sequence('mod+k mod+s');
};
