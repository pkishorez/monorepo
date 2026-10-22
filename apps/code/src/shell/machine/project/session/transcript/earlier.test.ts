import type { Message } from '@kestack/ai-toolkit/api';
import { describe, expect, it } from 'vitest';
import { earlierOf } from './earlier.ts';

const said = (id: string, sessionId: string, turnId: string): Message => ({
  id,
  sessionId,
  turnId,
  agentId: null,
  role: 'assistant',
  parts: [{ type: 'text', text: id }],
  at: 0,
});
const ended = (id: string, sessionId: string, turnId: string): Message => ({
  ...said(id, sessionId, turnId),
  role: 'system',
  parts: [{ type: 'turnEnded', status: 'done' }],
});

// `a` ran t1 and t2; `b` forked `a` after t2, then ran t3; `c` forked `b`
// after t3; `d` forked `c` after t1, a Turn `c` inherited from `a`.
const a = [
  said('01', 'a', 't1'),
  ended('02', 'a', 't1'),
  said('03', 'a', 't2'),
  ended('04', 'a', 't2'),
  said('09', 'a', 't9'),
];
const b = [said('05', 'b', 't3'), ended('06', 'b', 't3')];
const lineage = [
  { id: 'c', forkedFrom: { sessionId: 'b', turnId: 't3' } },
  { id: 'b', forkedFrom: { sessionId: 'a', turnId: 't2' } },
  { id: 'a', forkedFrom: null },
];
const windows = (
  given: Record<string, ReadonlyArray<Message>>,
  caughtUp = true,
) =>
  new Map(Object.entries(given).map(([id, rows]) => [id, { rows, caughtUp }]));
const ids = (earlier: ReturnType<typeof earlierOf>) =>
  earlier._tag === 'Read' ? earlier.messages.map(({ id }) => id) : earlier._tag;

describe('the history a Fork carries on from', () => {
  it('is the original up to the end of the Turn forked after', () => {
    const earlier = earlierOf(
      { sessionId: 'a', turnId: 't1' },
      [{ id: 'a', forkedFrom: null }],
      windows({ a }),
    );
    expect(ids(earlier)).toEqual(['01', '02']);
    expect(earlier).toMatchObject({ turns: 1 });
  });

  it('reads up the chain: each one’s history, then its own Messages, by id', () => {
    const earlier = earlierOf(
      { sessionId: 'b', turnId: 't3' },
      lineage.slice(1),
      windows({ b: [...b].reverse(), a }),
    );
    expect(ids(earlier)).toEqual(['01', '02', '03', '04', '05', '06']);
    expect(earlier).toMatchObject({ turns: 3 });
  });

  it('reads an inherited Turn from where it was run', () => {
    // `d` forked `c` after t1, which `c` never ran.
    const earlier = earlierOf(
      { sessionId: 'c', turnId: 't1' },
      lineage,
      windows({ c: [], b, a }),
    );
    expect(ids(earlier)).toEqual(['01', '02']);
  });

  it('never reads an original past where the Session below it was forked', () => {
    // `a` ran t9 after `b` forked it after t2: t9 is not `b`'s.
    expect(
      ids(
        earlierOf(
          { sessionId: 'b', turnId: 't9' },
          lineage.slice(1),
          windows({ b, a }),
        ),
      ),
    ).toBe('Missing');
    // `d` was forked from `c` after t1, so t2 of `a` is not `d`'s either,
    // though `b`, further up, holds it.
    const fromD = [
      { id: 'd', forkedFrom: { sessionId: 'c', turnId: 't1' } },
      ...lineage,
    ];
    expect(
      ids(
        earlierOf(
          { sessionId: 'd', turnId: 't2' },
          fromD,
          windows({ d: [], c: [], b, a }),
        ),
      ),
    ).toBe('Missing');
    expect(
      ids(
        earlierOf(
          { sessionId: 'd', turnId: 't1' },
          fromD,
          windows({ d: [], c: [], b, a }),
        ),
      ),
    ).toEqual(['01', '02']);
  });

  it('is still being read while a Window it needs is not Caught Up', () => {
    expect(
      ids(
        earlierOf(
          { sessionId: 'c', turnId: 't1' },
          lineage,
          windows({ c: [], b, a }, false),
        ),
      ),
    ).toBe('Reading');
    // What the device holds is drawn at once, Caught Up or not.
    expect(
      ids(
        earlierOf(
          { sessionId: 'a', turnId: 't1' },
          [{ id: 'a', forkedFrom: null }],
          windows({ a }, false),
        ),
      ),
    ).toEqual(['01', '02']);
  });

  it('is missing when the Turn is nowhere up the chain, or a Session is gone', () => {
    expect(
      ids(
        earlierOf(
          { sessionId: 'a', turnId: 'nope' },
          [{ id: 'a', forkedFrom: null }],
          windows({ a }),
        ),
      ),
    ).toBe('Missing');
    expect(
      ids(earlierOf({ sessionId: 'gone', turnId: 't1' }, [], windows({}))),
    ).toBe('Missing');
  });
});
