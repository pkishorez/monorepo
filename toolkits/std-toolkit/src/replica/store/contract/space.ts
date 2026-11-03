import { Effect, type Layer } from 'effect';
import type { Entity } from '../../../core/index.js';
import { DatabaseError, type StdTableService } from '../../../db/index.js';
import {
  COLLECTION_ROW,
  collections,
  cursors,
  nextSequence,
  OPENING,
  openings,
  records,
  space,
  START,
  TOLD,
  told,
  OUTSIDE,
  UNNAMED,
  WHOLE,
  type SPACE_TABLE,
} from './layout.js';

/*
 * Reading and writing one space. Every write keeps the newer `_u` of each
 * Entity and gives each record it keeps the next number in its Collection,
 * so a reader asks only for what was written after the number it last read.
 * A cursor is written with the last records of its batch, never before them,
 * and each Strategy scope keeps its own. Each record names the Window it is
 * in, so one Window's records are found without reading the others. Each
 * participant's open Windows are one row of their own, which the
 * participant alone writes; what the Leader tells is Caught Up is one row,
 * which only the Leader writes.
 *
 * A Window pruned goes cursor first, then its records, then its
 * Collection's generation is raised: stopped part way, it is Never Synced,
 * so its next Strategy reads it whole, and what is left of it goes with the
 * next prune. A reader that finds the generation raised reads the
 * Collection afresh, since reading on from a number never shows a record
 * gone.
 */

/** An Entity in encoded form, as the Store keeps it. */
export type Wire = Entity<unknown>;

/** A record as read back: its id, its Entity, and the Window it is named in. */
export interface Stored {
  readonly id: string;
  readonly entity: Wire;
  readonly window: string;
}

/** A Strategy's cursor, as it was saved. */
export interface Cursor {
  readonly strategy: string;
  readonly state: unknown;
}

/** One Collection's part of a write: its records by id, each with its Window, and the cursor of the scope that read them. */
export interface Written {
  readonly collection: string;
  readonly records: ReadonlyArray<Stored>;
  readonly cursor?: Cursor & { readonly scope: string };
}

/** A Window a participant has open. */
export interface Opening {
  readonly collection: string;
  readonly path: string;
  readonly value: string | number | boolean;
}

export type SpaceTable = Layer.Layer<StdTableService<typeof SPACE_TABLE>>;

// Each transaction holds the Collection's row beside its records; the
// StdTable contract takes 100 operations at most: a chunk's records, its
// Collection row, and on the last chunk a cursor row.
const CHUNK = 98;
const PAGE = 500;
const READS = 12;
const RETRIES = 10;

const raced = (error: DatabaseError) => error.reason._tag === 'TransactFailed';

const rowKey = (collection: string) => ({ collection, key: COLLECTION_ROW });

/** The newest Entity of each id in a batch. */
const newestById = (written: Written['records']) => {
  const newest = new Map<string, Written['records'][number]>();
  for (const record of written) {
    const seen = newest.get(record.id);
    if (!seen || record.entity.meta._u > seen.entity.meta._u)
      newest.set(record.id, record);
  }
  return [...newest.values()];
};

const writeCollection = (written: Written) =>
  Effect.gen(function* () {
    const { collection } = written;
    const row = yield* collections.get(rowKey(collection));
    const saved = written.cursor
      ? yield* cursors.get({ collection, scope: written.cursor.scope })
      : null;
    const candidates = newestById(written.records);
    const stored = yield* Effect.forEach(
      candidates,
      ({ id }) => records.get({ collection, id }),
      {
        concurrency: READS,
      },
    );
    const accepted = candidates.flatMap((candidate, index) => {
      const current = stored[index] ?? null;
      // The Store wrote it, so it is an Entity in encoded form.
      const kept = current?.value.entity as Wire | undefined;
      return kept && candidate.entity.meta._u <= kept.meta._u
        ? []
        : [{ ...candidate, observed: current?.value.seq ?? null }];
    });
    if (accepted.length === 0 && written.cursor === undefined) return false;

    let position = row?.value.position ?? START;
    let exists = row !== null;
    const chunks = Array.from(
      { length: Math.max(1, Math.ceil(accepted.length / CHUNK)) },
      (_, index) => accepted.slice(index * CHUNK, (index + 1) * CHUNK),
    );
    for (const [index, chunk] of chunks.entries()) {
      const observed = position;
      const ops = [];
      for (const record of chunk) {
        position = nextSequence(position);
        const value = {
          collection,
          id: record.id,
          seq: position,
          entity: record.entity,
          window: record.window,
        };
        ops.push(
          record.observed === null
            ? yield* records.insertOp(value)
            : yield* records.getAndUpdateOp(
                { collection, id: record.id },
                {
                  seq: position,
                  entity: record.entity,
                  window: record.window,
                },
                { check: (current) => current.seq === record.observed },
              ),
        );
      }
      if (index === chunks.length - 1 && written.cursor) {
        const { scope, strategy, state } = written.cursor;
        const cursor = state as {} | null;
        ops.push(
          saved
            ? yield* cursors.getAndUpdateOp(
                { collection, scope },
                { strategy, cursor },
              )
            : yield* cursors.insertOp({ collection, scope, strategy, cursor }),
        );
      }
      ops.push(
        exists
          ? yield* collections.getAndUpdateOp(
              rowKey(collection),
              { position },
              { check: (current) => current.position === observed },
            )
          : yield* collections.insertOp({
              ...rowKey(collection),
              position,
              generation: 0,
            }),
      );
      yield* space.transact(ops);
      exists = true;
    }
    return true;
  });

/** Writes each Collection's part, each in its own transactions, and says whether anything changed. */
export const write = (written: ReadonlyArray<Written>) =>
  Effect.forEach(written, (part) =>
    writeCollection(part).pipe(
      // Another participant wrote first: read again and try what is left.
      Effect.retry({
        times: RETRIES,
        while: (error) => error instanceof DatabaseError && raced(error),
      }),
    ),
  ).pipe(Effect.map((changed) => changed.some(Boolean)));

/** Every record of a Collection written after `after`, in the order written, and the number of the last one. */
export const readAfter = (collection: string, after: string | null) =>
  Effect.gen(function* () {
    const read: Stored[] = [];
    let position = after ?? START;
    while (true) {
      const found = yield* records.query(
        'bySequence',
        { pk: { collection }, '>': { seq: position } },
        { limit: PAGE },
      );
      for (const item of found.items) {
        // The Store wrote it, so it is an Entity in encoded form.
        read.push({
          id: item.value.id,
          entity: item.value.entity as Wire,
          window: item.value.window,
        });
        position = item.value.seq;
      }
      if (!found.hasMore || found.items.length === 0)
        return { records: read, position };
    }
  });

/** How many times Windows were pruned from a Collection: 0 before the first. */
export const generationOf = (collection: string) =>
  collections
    .get(rowKey(collection))
    .pipe(Effect.map((row) => row?.value.generation ?? 0));

const isGone = (error: DatabaseError) => error.reason._tag === 'NoItemToUpdate';

/**
 * Names the Window of each record given, as its Instance reads it. Only the
 * Window changes: no number, so no reader reads it again. A record gone or
 * named so already is passed over.
 */
export const rename = (
  collection: string,
  named: ReadonlyArray<{ readonly id: string; readonly window: string }>,
) =>
  Effect.forEach(
    named,
    ({ id, window }) =>
      Effect.gen(function* () {
        const row = yield* records.get({ collection, id });
        if (row === null || row.value.window === window) return;
        yield* records.getAndUpdate(
          { collection, id },
          { window },
          { retries: RETRIES },
        );
      }).pipe(Effect.catchIf(isGone, () => Effect.void)),
    { concurrency: READS, discard: true },
  );

/** Every Window scope a Collection keeps records or a cursor of: never `OUTSIDE`, `UNNAMED` or the whole Collection's. */
export const windowsIn = (collection: string) =>
  Effect.gen(function* () {
    const found = new Set<string>();
    // One read per Window: each asks for the first record named after the
    // last Window found.
    let after = OUTSIDE;
    while (true) {
      const next = yield* records.query(
        'byWindow',
        { pk: { collection }, '>': { window: after } },
        { limit: 1 },
      );
      const item = next.items[0];
      if (item === undefined) break;
      after = item.value.window;
      found.add(after);
    }
    let page = yield* cursors.query(
      'primary',
      { pk: { collection }, '>=': null },
      { limit: PAGE },
    );
    while (true) {
      for (const item of page.items) found.add(item.value.scope);
      if (!page.hasMore || page.items.length === 0) break;
      page = yield* cursors.query(
        'primary',
        { pk: { collection }, '>=': null },
        { limit: PAGE, after: page.items.at(-1)! },
      );
    }
    found.delete(UNNAMED);
    found.delete(WHOLE);
    return [...found];
  });

/** Deletes one Window of a Collection: its cursor, then its records, then raises the Collection's generation. */
export const dropWindow = (collection: string, scope: string) =>
  Effect.gen(function* () {
    yield* cursors
      .hardDelete({ collection, scope }, 'I KNOW WHAT I AM DOING')
      .pipe(Effect.catchIf(isGone, () => Effect.void));
    while (true) {
      const found = yield* records.query(
        'byWindow',
        { pk: { collection }, '=': { window: scope } },
        { limit: PAGE },
      );
      if (found.items.length === 0) break;
      yield* Effect.forEach(
        found.items,
        (item) =>
          records
            .hardDelete(
              { collection, id: item.value.id },
              'I KNOW WHAT I AM DOING',
            )
            .pipe(Effect.catchIf(isGone, () => Effect.void)),
        { concurrency: READS, discard: true },
      );
    }
    const row = yield* collections.get(rowKey(collection));
    if (row !== null)
      yield* collections.getAndUpdate(
        rowKey(collection),
        { generation: row.value.generation + 1 },
        { retries: RETRIES },
      );
  });

/** The cursor a scope's Strategy saved, if it saved one. */
export const cursorOf = (collection: string, scope: string) =>
  cursors
    .get({ collection, scope })
    .pipe(
      Effect.map((row): Cursor | null =>
        row === null
          ? null
          : { strategy: row.value.strategy, state: row.value.cursor },
      ),
    );

const openingKey = (participant: string) => ({ kind: OPENING, participant });

const firstOpenings = openings.query(
  'primary',
  { pk: { kind: OPENING }, '>=': null },
  { limit: PAGE },
);

type OpeningRow = Effect.Success<typeof firstOpenings>['items'][number];

const openingsAfter = (after: OpeningRow) =>
  openings.query(
    'primary',
    { pk: { kind: OPENING }, '>=': null },
    { limit: PAGE, after },
  );

/** Every participant's open Windows, by participant. */
export const openingsOf = Effect.gen(function* () {
  const read = new Map<string, ReadonlyArray<Opening>>();
  let found = yield* firstOpenings;
  while (true) {
    for (const item of found.items)
      // The Store wrote it, so it is a list of Openings.
      read.set(item.value.participant, item.value.windows as Opening[]);
    if (!found.hasMore || found.items.length === 0) return read;
    found = yield* openingsAfter(found.items.at(-1)!);
  }
});

/** Writes the Windows one participant has open; none takes its row away. */
export const announce = (
  participant: string,
  windows: ReadonlyArray<Opening>,
) =>
  Effect.gen(function* () {
    const row = yield* openings.get(openingKey(participant));
    const written = windows as unknown as {};
    if (windows.length === 0) {
      if (row !== null) yield* forget(participant);
      return;
    }
    if (row === null)
      yield* openings.insert({ ...openingKey(participant), windows: written });
    else
      yield* openings.getAndUpdate(openingKey(participant), {
        windows: written,
      });
  });

/** Takes a participant's row away, if it has one. */
export const forget = (participant: string) =>
  openings.hardDelete(openingKey(participant), 'I KNOW WHAT I AM DOING').pipe(
    Effect.asVoid,
    Effect.catchIf(
      (error) => error.reason._tag === 'NoItemToUpdate',
      () => Effect.void,
    ),
  );

/** The scopes the Leader last told are Caught Up; none before it first told. */
export const toldOf = told.get(TOLD).pipe(
  Effect.map((row): ReadonlyArray<string> =>
    // The Store wrote it, so it is a list of scopes.
    row === null ? [] : (row.value.scopes as ReadonlyArray<string>),
  ),
);

/** Writes the scopes the Leader tells are Caught Up, in place of the last. */
export const tell = (scopes: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const written = scopes as unknown as {};
    const row = yield* told.get(TOLD);
    if (row === null) yield* told.insert({ ...TOLD, scopes: written });
    else yield* told.getAndUpdate(TOLD, { scopes: written });
  });
