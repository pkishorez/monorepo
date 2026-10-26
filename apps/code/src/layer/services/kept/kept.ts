import { Clock, Effect, Layer, Schema, Semaphore } from 'effect';
import {
  type QueryOptions,
  StdTable,
  type StdTableService,
} from '@kestack/std-toolkit/db';
import { IDB } from '@kestack/std-toolkit/db/idb';
import { Memory } from '@kestack/std-toolkit/db/memory';
import { EntityESchema } from '@kestack/std-toolkit/eschema';
import {
  type Gone,
  Kept,
  type Shelf,
  went,
  type Whose,
} from '../../capabilities/index.ts';
import { keyOf, RETRIES, scan, upsert } from './rows.ts';

/*
 * Kept copies in this browser's IndexedDB, one database of their own: a
 * row for each copy, named by its kind and whose it is, holding its JSON
 * and the version of its shape. Nothing here is the truth.
 *
 * 1. Read    a row kept at another version, or that no longer reads, reads
 *            as nothing.
 * 2. Write   replaces the row, or makes it; the writes of a row run one at
 *            a time, in the order asked, and one asked before its owner
 *            went is not made.
 * 3. Drop    every row of what went is deleted.
 *
 * The rows kept before this store, the Machine Lists and Machine settings
 * of `code:machines`, are deleted with their database, once: each is
 * asked again.
 */

const CopySchema = EntityESchema.make('KeptCopy', 'key', {
  shelf: Schema.String,
  accountId: Schema.String,
  machineId: Schema.NullOr(Schema.String),
  projectId: Schema.NullOr(Schema.String),
  version: Schema.Finite,
  json: Schema.String,
}).build();

const TABLE = 'kept';
const CONFIRM = 'I KNOW WHAT I AM DOING';

const table = StdTable.make(TABLE).primary('pk', 'sk').build();

const rows = table.entity(CopySchema).primary().build();

const keyIn = (shelf: Shelf<unknown>, whose: Whose) =>
  keyOf(
    shelf.name,
    whose.accountId,
    whose.machineId ?? '',
    whose.projectId ?? '',
  );

const make = (layer: Layer.Layer<StdTableService<typeof TABLE>>) => {
  // 2. Write: one at a time for each row.
  const turns = new Map<string, Semaphore.Semaphore>();
  const inTurn = (key: string) => {
    let turn = turns.get(key);
    if (turn === undefined) {
      turn = Semaphore.makeUnsafe(1);
      turns.set(key, turn);
    }
    return Semaphore.withPermits(turn, 1);
  };

  // 3. Drop: what went and when, so a write asked before is never made after.
  const drops: Array<{ readonly gone: Gone; readonly at: bigint }> = [];

  return Kept.of({
    // 1. Read
    read: (shelf, whose) =>
      rows.get({ key: keyIn(shelf, whose) }).pipe(
        Effect.flatMap((row) =>
          row === null || row.value.version !== shelf.version
            ? Effect.succeed(null)
            : Schema.decodeUnknownEffect(shelf.json)(row.value.json),
        ),
        Effect.provide(layer),
        Effect.orElseSucceed(() => null),
      ),
    // 2. Write
    write: (shelf, whose, value) =>
      Effect.flatMap(Clock.monotonicTimeNanos, (asked) => {
        const key = keyIn(shelf, whose);
        return Effect.gen(function* () {
          if (drops.some(({ gone, at }) => at > asked && went(gone)(whose)))
            return;
          const json = yield* Schema.encodeEffect(shelf.json)(value);
          const fields = { version: shelf.version, json };
          yield* upsert({
            get: rows.get({ key }),
            insert: rows.insert({
              key,
              shelf: shelf.name,
              ...whose,
              ...fields,
            }),
            update: () =>
              rows.getAndUpdate({ key }, () => fields, { retries: RETRIES }),
          });
        }).pipe(inTurn(key), Effect.provide(layer), Effect.ignore);
      }),
    // 3. Drop
    drop: (gone) =>
      Effect.flatMap(Clock.monotonicTimeNanos, (at) => {
        drops.push({ gone, at });
        return scan((options: QueryOptions<typeof CopySchema.Type>) =>
          rows.query('primary', { pk: {}, '>=': null }, options),
        );
      }).pipe(
        Effect.flatMap((found) =>
          Effect.forEach(
            found.filter(went(gone)),
            ({ key }) => rows.hardDelete({ key }, CONFIRM).pipe(inTurn(key)),
            { discard: true },
          ),
        ),
        Effect.provide(layer),
        Effect.ignore,
      ),
  });
};

/** Kept copies in this browser's IndexedDB; the database of before goes. */
export const idb = Layer.unwrap(
  Effect.sync(() =>
    Layer.succeed(
      Kept,
      make(
        IDB.make(table, {
          database: IDB.database({ databaseName: 'code:kept' }),
          mode: 'disposable',
        }).layer,
      ),
    ),
  ).pipe(
    Effect.tap(() =>
      IDB.prune({ prefix: 'code:machines', keep: [] }).pipe(Effect.ignore),
    ),
  ),
);

/** Kept copies in memory, for a test. */
export const memory = () => Layer.succeed(Kept, make(Memory.make(table).layer));
