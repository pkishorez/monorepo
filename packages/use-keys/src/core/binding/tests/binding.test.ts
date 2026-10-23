import { describe as group, expect, it } from 'vitest';
import {
  bindingOf,
  conflicts,
  describe,
  sequence,
  shortcut,
  shortcutOf,
} from '../index.ts';

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

  it('takes Space as a leader, as its first step', () => {
    expect(sequence('Space e')).toEqual({
      type: 'sequence',
      steps: [shortcut('Space'), shortcut('e')],
    });
    expect(describe(sequence('Space e'))).toBe('Space e');
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

group('bindingOf', () => {
  it('reads keys written at runtime as a Shortcut or a Sequence', () => {
    expect(bindingOf('mod+k')).toEqual(shortcut('mod+k'));
    expect(bindingOf('g g')).toEqual(sequence('g g'));
    expect(bindingOf('mod++')).toEqual(shortcut('mod++'));
  });

  it('throws on text that is neither', () => {
    expect(() => bindingOf('cmd+k')).toThrow('no modifier "cmd"');
  });
});

group('shortcutOf', () => {
  const press = (
    key: string,
    code: string,
    held: Partial<KeyboardEvent> = {},
  ) => ({
    key,
    code,
    shiftKey: false,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    ...held,
  });

  it('records Ctrl as ctrl, and Cmd as mod on a Mac', () => {
    const ctrl = shortcutOf(press('k', 'KeyK', { ctrlKey: true }), {
      mac: true,
    });
    expect(describe(ctrl!)).toBe('ctrl+k');
    const cmd = shortcutOf(press('k', 'KeyK', { metaKey: true }), {
      mac: true,
    });
    expect(describe(cmd!)).toBe('mod+k');
    const both = shortcutOf(
      press('k', 'KeyK', { ctrlKey: true, metaKey: true }),
      {
        mac: true,
      },
    );
    expect(describe(both!)).toBe('ctrl+meta+k');
    const elsewhere = shortcutOf(press('k', 'KeyK', { ctrlKey: true }), {
      mac: false,
    });
    expect(describe(elsewhere!)).toBe('ctrl+k');
  });

  it('names keys as they are matched: a letter in lowercase, a symbol as typed', () => {
    expect(describe(shortcutOf(press('K', 'KeyK', { shiftKey: true }))!)).toBe(
      'shift+k',
    );
    expect(describe(shortcutOf(press('?', 'Slash', { shiftKey: true }))!)).toBe(
      '?',
    );
    expect(describe(shortcutOf(press(' ', 'Space'))!)).toBe('Space');
    expect(
      describe(shortcutOf(press('Enter', 'Enter', { shiftKey: true }))!),
    ).toBe('shift+Enter');
  });

  it('gives nothing for a modifier alone or a key no Shortcut names', () => {
    expect(
      shortcutOf(press('Control', 'ControlLeft', { ctrlKey: true })),
    ).toBeNull();
    expect(shortcutOf(press('CapsLock', 'CapsLock'))).toBeNull();
  });

  it('records what a Shortcut it names is pressed by', () => {
    const recorded = shortcutOf(press('[', 'BracketLeft', { ctrlKey: true }), {
      mac: false,
    });
    expect(conflicts(recorded!, shortcut('ctrl+['), false)).toBe(true);
  });
});
