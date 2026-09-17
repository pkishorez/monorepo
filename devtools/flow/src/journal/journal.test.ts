import { Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import type { Entry } from './entry.js';
import {
  fromJournalFile,
  JournalFileSchema,
  mergeJournals,
  toJournalFile,
} from './journal.js';

const make = (
  id: string,
  timestamp: number,
  origin: string | undefined,
  sequence: number,
): Entry => ({
  kind: 'event',
  id,
  flowId: 'f',
  participantName: 'p',
  name: id,
  sequence,
  timestamp,
  severity: 'info',
  ...(origin === undefined ? {} : { origin }),
});

describe('mergeJournals', () => {
  it('dedupes by id and orders by clock, origin, then sequence', () => {
    const merged = mergeJournals([
      {
        flowId: 'f',
        entries: [make('a1', 2, 'a', 1), make('a2', 5, 'a', 2)],
      },
      {
        flowId: 'f',
        entries: [make('b1', 2, 'b', 1), make('a1', 2, 'a', 1)],
      },
      { flowId: 'other', entries: [make('x', 0, undefined, 1)] },
    ]);
    expect(merged.ordering).toBe('clock');
    expect(merged.entries.map(({ id }) => id)).toEqual(['a1', 'b1', 'a2']);
  });

  it('round-trips through the file form', () => {
    const journal = mergeJournals([
      { flowId: 'f', entries: [make('a', 1, undefined, 1)] },
    ]);
    const file = Schema.decodeUnknownSync(JournalFileSchema)(
      JSON.parse(JSON.stringify(toJournalFile(journal))),
    );
    expect(fromJournalFile(file)).toEqual(journal);
  });
});
