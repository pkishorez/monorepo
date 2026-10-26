import { describe, expect, it } from 'vitest';
import { readyOf, showingOf } from '../actor.ts';

/*
 * What home draws, and when: nothing until the list kept on this device
 * and each Connection's projects held here are read; never a skeleton under
 * the Connections' own word that Cloud Connect cannot list them and nothing
 * is kept; a skeleton only for what was never synced here; no project yet
 * only once that is known.
 */

const known = {
  read: true,
  connectionIds: ['m1', 'm2'],
  problem: null,
};
const read = (
  status: 'loading' | 'ready',
  rows: ReadonlyArray<unknown> = [],
  neverSynced: ReadonlyArray<string> = [],
) => ({ status, rows, neverSynced });

describe('home', () => {
  it('draws nothing until the kept list is read', () => {
    expect(showingOf({ ...known, read: false, connectionIds: null }, [])).toBe(
      'nothing',
    );
  });

  it('draws nothing until every Connection’s projects held here are read', () => {
    expect(showingOf(known, [read('ready', ['p'])])).toBe('nothing');
    expect(showingOf(known, [read('ready', ['p']), read('loading')])).toBe(
      'nothing',
    );
  });

  it('then draws what is held in one step', () => {
    expect(showingOf(known, [read('ready', ['p']), read('ready')])).toBe(
      'projects',
    );
  });

  it('says no project yet only once every Connection has synced here', () => {
    expect(showingOf(known, [read('ready'), read('ready')])).toBe('empty');
    expect(
      showingOf(known, [read('ready'), read('ready', [], ['code·m2'])]),
    ).toBe('waiting');
  });

  it('leaves the word to the Connections when Cloud Connect fails and nothing is kept, never a skeleton', () => {
    expect(
      showingOf({ read: true, connectionIds: null, problem: 'offline' }, []),
    ).toBe('nothing');
    // Nothing kept, and Cloud Connect still asked: a skeleton meanwhile.
    expect(
      showingOf({ read: true, connectionIds: null, problem: null }, []),
    ).toBe('waiting');
    // No Connection at all: the Connections say how to start one.
    expect(showingOf({ ...known, connectionIds: [] }, [])).toBe('nothing');
  });
});

describe('home, ready', () => {
  it('is ready once the kept list and each Connection’s projects held here are read', () => {
    expect(readyOf({ ...known, read: false }, [])).toBe(false);
    expect(readyOf(known, [read('ready', ['p'])])).toBe(false);
    expect(readyOf(known, [read('ready', ['p']), read('loading')])).toBe(false);
    expect(readyOf(known, [read('ready', ['p']), read('ready')])).toBe(true);
  });

  it('is ready, from this device alone, while the Connections say why there are none', () => {
    expect(readyOf({ ...known, connectionIds: [] }, [])).toBe(true);
    expect(
      readyOf({ read: true, connectionIds: null, problem: 'offline' }, []),
    ).toBe(true);
    // Nothing kept, Cloud Connect still asked: drawn waiting, not waited for.
    expect(
      readyOf({ read: true, connectionIds: null, problem: null }, []),
    ).toBe(true);
  });
});
