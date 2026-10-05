import { sequence, shortcut } from '@kstackz/use-keys';
import { describe, expect, it } from 'vitest';
import { bindingsOf, keysOff, written } from '../bindings.ts';

describe('the user’s own keys, as stored', () => {
  it('reads back what it wrote', () => {
    const keys = {
      add: written(shortcut('mod+n')),
      home: written(sequence('g h')),
    };
    expect(keys).toEqual({ add: 'mod+n', home: 'g h' });
    expect(bindingsOf(keys)).toEqual({
      add: [shortcut('mod+n')],
      home: [sequence('g h')],
    });
  });

  it('leaves out keys it can no longer read', () => {
    expect(bindingsOf({ add: 'hyper+x' })).toEqual({});
  });
});

describe('Keys off', () => {
  it('takes every key but finding a Command and those of what is open', () => {
    const off = keysOff(bindingsOf({ next: 'n' })) as Record<string, unknown>;
    expect(off['next']).toEqual([]);
    expect(off['toHome']).toEqual([]);
    expect(off['entries.entry.remove']).toEqual([]);
    expect(off['openPalette']).toBeUndefined();
    expect(off['add.save']).toBeUndefined();
    expect(off['palette.close']).toBeUndefined();
  });
});
