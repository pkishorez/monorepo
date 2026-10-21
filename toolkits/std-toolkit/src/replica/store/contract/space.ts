import { Effect, type Layer } from 'effect';
import type { Entity } from '../../../core/index.js';
import { DatabaseError, type StdTableService } from '../../../db/index.js';
import {
  COLLECTION_ROW,
  collections,
  nextSequence,
  records,
  space,
  START,
  type SPACE_TABLE,
} from './layout.js';

/*
 * Reading and writing one space. Every write keeps the newer `_u` of each
 * Entity and gives each record it keeps the next number in its Collection,
 * so a reader asks only for what was written after the number it last read.
 * A cursor is written with the last records of its batch, never before them.
 */

/** An Entity in encoded form, as the Store keeps it. */
export type Wire = Entity<unknown>;

/** A Strategy's cursor, as it was saved. */
export interface Cursor {
  readonly strategy: string;
  readonly state: unknown;
}

/** One Collection's part of a write: its records by id, and the cursor that follows them. */
export interface Written {
  readonly collection: string;
  readonly records: ReadonlyArray<{
    readonly id: string;
    readonly entity: Wire;
  }>;
  readonly cursor?: Cursor;
}

export type SpaceTable = Layer.Layer<StdTableService<typeof SPACE_TABLE>>;

// Each transaction holds the Collection's row beside its records; the
// StdTable contract takes 100 operations at most.
const CHUNK = 99;
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
        };
        ops.push(
          record.observed === null
            ? yield* records.insertOp(value)
            : yield* records.getAndUpdateOp(
                { collection, id: record.id },
                { seq: position, entity: record.entity },
                { check: (current) => current.seq === record.observed },
              ),
        );
      }
      const cursor =
        index === chunks.length - 1 && written.cursor
          ? {
              strategy: written.cursor.strategy,
              cursor: written.cursor.state as {} | null,
            }
          : {};
      ops.push(
        exists
          ? yield* collections.getAndUpdateOp(
              rowKey(collection),
              { position, ...cursor },
              { check: (current) => current.position === observed },
            )
          : yield* collections.insertOp({
              ...rowKey(collection),
              position,
              strategy: null,
              cursor: null,
              ...cursor,
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
    const read: Wire[] = [];
    let position = after ?? START;
    while (true) {
      const found = yield* records.query(
        'bySequence',
        { pk: { collection }, '>': { seq: position } },
        { limit: PAGE },
      );
      for (const item of found.items) {
        // The Store wrote it, so it is an Entity in encoded form.
        read.push(item.value.entity as Wire);
        position = item.value.seq;
      }
      if (!found.hasMore || found.items.length === 0)
        return { records: read, position };
    }
  });

/** A Collection's saved cursor, if a Strategy saved one. */
export const cursorOf = (collection: string) =>
  collections
    .get(rowKey(collection))
    .pipe(
      Effect.map((row): Cursor | null =>
        row?.value.strategy == null
          ? null
          : { strategy: row.value.strategy, state: row.value.cursor },
      ),
    );
