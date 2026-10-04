import { describe, expect, it } from 'vitest';
import type { Key } from '../../key/index.ts';
import {
  sequence as toSequence,
  shortcut as toShortcut,
  type ShortcutObject,
  type ShortcutString,
} from '../../binding/index.ts';
import { createKeymap, type Entry } from '../index.ts';

type Written = ShortcutString | ShortcutObject;

const shortcut = (...steps: Written[]): Entry => ({
  bindings: steps.map(toShortcut),
  inTextEntry: false,
});
const sequence = (...steps: [Written, Written, ...Written[]]): Entry => ({
  bindings: [toSequence(steps)],
  inTextEntry: false,
});

const down = (code: string, name: string): Key => ({
  code,
  name,
  downAt: 0,
  upAt: null,
});

const keymap = (mac = false) => createKeymap({ mac, timeout: () => 1000 });

const added = (map: ReturnType<typeof keymap>, entry: Entry) => {
  const result = map.add(entry);
  if (!('id' in result)) throw new Error('conflict');
  return result.id;
};

const press = (name: string, keys: Key[] = [], now = 0, textEntry = false) => ({
  name,
  keys,
  now,
  textEntry,
});

describe('keymap', () => {
  it('commits a plain Shortcut only with no modifier down', () => {
    const map = keymap();
    const id = added(map, shortcut('j'));
    expect(map.press(press('j'))).toEqual({
      taken: true,
      outcomes: [{ id, type: 'commit' }],
    });
    const ctrl = [down('ControlLeft', 'Control')];
    expect(map.press(press('j', ctrl)).taken).toBe(false);
  });

  it('reads mod as Cmd on Apple platforms and Ctrl elsewhere', () => {
    const cmd = [down('MetaLeft', 'Meta')];
    const ctrl = [down('ControlLeft', 'Control')];
    const mac = keymap(true);
    added(mac, shortcut({ key: 'k', mod: true }));
    expect(mac.press(press('k', cmd)).taken).toBe(true);
    expect(mac.press(press('k', ctrl)).taken).toBe(false);
    const pc = keymap(false);
    added(pc, shortcut({ key: 'k', mod: true }));
    expect(pc.press(press('k', ctrl)).taken).toBe(true);
    expect(pc.press(press('k', cmd)).taken).toBe(false);
  });

  it('tells sides apart and allows either with any', () => {
    const map = keymap();
    added(map, shortcut({ key: 'k', shift: 'right' }));
    added(map, shortcut({ key: 'j', shift: 'any' }));
    expect(map.press(press('k', [down('ShiftLeft', 'Shift')])).taken).toBe(
      false,
    );
    expect(map.press(press('k', [down('ShiftRight', 'Shift')])).taken).toBe(
      true,
    );
    expect(map.press(press('j')).taken).toBe(true);
    expect(map.press(press('j', [down('ShiftLeft', 'Shift')])).taken).toBe(
      true,
    );
  });

  it('ignores Shift for a symbol, which is the character typed', () => {
    const map = keymap();
    added(map, shortcut('?'));
    expect(map.press(press('?', [down('ShiftLeft', 'Shift')])).taken).toBe(
      true,
    );
  });

  it('commits a Sequence on its last step', () => {
    const map = keymap();
    const id = added(map, sequence('g', 'g'));
    expect(map.press(press('g', [], 0)).outcomes).toEqual([
      { id, type: 'possible', progress: [{ binding: 0, next: 1 }] },
    ]);
    expect(map.press(press('g', [], 500)).outcomes).toEqual([
      { id, type: 'commit' },
    ]);
  });

  it('cancels a Sequence on a wrong key or a late step', () => {
    const map = keymap();
    const id = added(map, sequence('g', 'g'));
    map.press(press('g', [], 0));
    expect(map.press(press('x', [], 10)).outcomes).toEqual([
      { id, type: 'cancel', reason: 'key' },
    ]);
    map.press(press('g', [], 100));
    expect(map.deadline()).toBe(1100);
    expect(map.expire(1101)).toEqual([{ id, type: 'cancel', reason: 'late' }]);
  });

  it('starts over on a key that breaks a Sequence', () => {
    const map = keymap();
    const gg = added(map, sequence('g', 'g'));
    const j = added(map, shortcut('j'));
    map.press(press('g'));
    expect(map.press(press('j')).outcomes).toEqual([
      { id: gg, type: 'cancel', reason: 'key' },
      { id: j, type: 'commit' },
    ]);
  });

  it('lets Sequences that start the same both wait', () => {
    const map = keymap();
    const gg = added(map, sequence('g', 'g'));
    const gi = added(map, sequence('g', 'i'));
    expect(map.press(press('g')).outcomes).toEqual([
      { id: gg, type: 'possible', progress: [{ binding: 0, next: 1 }] },
      { id: gi, type: 'possible', progress: [{ binding: 0, next: 1 }] },
    ]);
    expect(map.press(press('i')).outcomes).toEqual([
      { id: gi, type: 'commit' },
      { id: gg, type: 'cancel', reason: 'key' },
    ]);
  });

  it('refuses keys that are the same as, or the start of, another', () => {
    const map = keymap();
    const g = added(map, shortcut('g'));
    expect(map.add(sequence('g', 'g'))).toEqual({ conflict: g });
    expect(map.add(shortcut({ key: 'g', shift: 'any' }))).toEqual({
      conflict: g,
    });
    expect('id' in map.add(shortcut({ key: 'g', shift: true }))).toBe(true);
    const gi = map.add(sequence('x', 'i'));
    expect('id' in gi).toBe(true);
    expect('id' in map.add(sequence('x', 'j'))).toBe(true);
  });

  it('presses in Text Entry only Shortcuts that ask and hold Ctrl, Alt or Cmd', () => {
    const map = keymap();
    added(map, { ...shortcut({ key: 'k', mod: true }), inTextEntry: true });
    added(map, { ...shortcut({ key: 'j', shift: true }), inTextEntry: true });
    added(map, shortcut({ key: 's', mod: true }));
    const ctrl = [down('ControlLeft', 'Control')];
    const shift = [down('ShiftLeft', 'Shift')];
    expect(map.press(press('k', ctrl, 0, true)).taken).toBe(true);
    expect(map.press(press('s', ctrl, 0, true)).taken).toBe(false);
    expect(map.press(press('j', shift, 0, true)).taken).toBe(false);
  });

  it('says how far each Sequence under way has come', () => {
    const map = keymap();
    const id = added(map, {
      bindings: [toSequence('g a b'), toSequence('g c d')],
      inTextEntry: false,
    });
    map.press(press('g'));
    expect(map.press(press('a')).outcomes).toEqual([
      { id, type: 'possible', progress: [{ binding: 0, next: 2 }] },
    ]);
    expect(map.press(press('b')).outcomes).toEqual([{ id, type: 'commit' }]);
  });
});
