import { Schema } from 'effect';
import { EntrySchema, type Entry } from './entry.js';

/** How a Journal's Entries are ordered. */
export const JournalOrderingSchema = Schema.Literals(['recorded', 'clock']);

export const JournalSchema = Schema.Struct({
  flowId: Schema.String,
  entries: Schema.Array(EntrySchema),
  /**
   * `recorded` when the order is the one a Flow Store or memory sink received
   * Entries in; `clock` when several Journals were merged and only the
   * recording clocks could order them.
   */
  ordering: JournalOrderingSchema,
}).annotate({
  title: 'Flow Journal',
  description: 'Every Entry recorded for one Flow, in order.',
});

/** The portable file form of one Journal. */
export const JournalFileSchema = Schema.Struct({
  version: Schema.Literal(1),
  flowId: Schema.String,
  entries: Schema.Array(EntrySchema),
});

export type JournalOrdering = typeof JournalOrderingSchema.Type;
export type Journal = typeof JournalSchema.Type;
export type JournalFile = typeof JournalFileSchema.Type;

const compareOrigin = (left: string | undefined, right: string | undefined) => {
  if (left === right) return 0;
  if (left === undefined) return 1;
  if (right === undefined) return -1;
  return left < right ? -1 : 1;
};

const compareClock = (left: Entry, right: Entry) =>
  left.timestamp - right.timestamp ||
  compareOrigin(left.origin, right.origin) ||
  left.sequence - right.sequence;

/** Groups a flat list of Entries into one Journal per Flow, in recorded order. */
export const groupJournals = (
  entries: Iterable<Entry>,
): ReadonlyMap<string, Journal> => {
  const byFlow = new Map<string, Entry[]>();
  for (const entry of entries) {
    const list = byFlow.get(entry.flowId);
    if (list) list.push(entry);
    else byFlow.set(entry.flowId, [entry]);
  }
  return new Map(
    [...byFlow].map(([flowId, list]) => [
      flowId,
      { flowId, entries: list, ordering: 'recorded' as const },
    ]),
  );
};

/**
 * Combines any number of Journals of one Flow into a single clock-ordered
 * Journal. Entries with the same id are kept once. Journals of other Flows
 * are ignored; the result names the first Journal's Flow.
 */
export const mergeJournals = (
  journals: ReadonlyArray<Pick<Journal, 'flowId' | 'entries'>>,
): Journal => {
  const first = journals[0];
  if (first === undefined) {
    return { flowId: '', entries: [], ordering: 'clock' };
  }
  const seen = new Map<string, Entry>();
  for (const journal of journals) {
    if (journal.flowId !== first.flowId) continue;
    for (const entry of journal.entries) {
      if (!seen.has(entry.id)) seen.set(entry.id, entry);
    }
  }
  return {
    flowId: first.flowId,
    entries: [...seen.values()].sort(compareClock),
    ordering: 'clock',
  };
};

export const toJournalFile = (journal: Journal): JournalFile => ({
  version: 1,
  flowId: journal.flowId,
  entries: journal.entries,
});

export const fromJournalFile = (file: JournalFile): Journal => ({
  flowId: file.flowId,
  entries: file.entries,
  ordering: 'clock',
});
