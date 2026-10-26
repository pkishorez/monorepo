import { Effect, Layer, Schema, type Scope } from 'effect';
import {
  type QueryOptions,
  StdTable,
  type StdTableService,
} from '@kestack/std-toolkit/db';
import { IDB } from '@kestack/std-toolkit/db/idb';
import { Memory } from '@kestack/std-toolkit/db/memory';
import { EntityESchema } from '@kestack/std-toolkit/eschema';
import {
  Kept,
  type Shelf,
  went,
  type Whose,
} from '../../capabilities/index.ts';
import { keyOf, RETRIES, scan, turns, upsert } from '../rows/index.ts';

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
 * 3. Drop    every row of what went is deleted, once the writes of it
 *            under way are made, so a row just made goes too.
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

const make = (
  layer: Layer.Layer<StdTableService<typeof TABLE>>,
  scope: Scope.Scope,
) => {
  // 2. Write and 3. Drop: in turn for each row.
  const turn = turns<Whose>(scope);

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
    write: (shelf, whose, value) => {
      const key = keyIn(shelf, whose);
      return turn.run({
        key,
        whose,
        does: Effect.gen(function* () {
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
        }).pipe(Effect.provide(layer), Effect.ignore),
        skipped: undefined,
      });
    },
    // 3. Drop
    drop: (gone) =>
      turn.drop(
        went(gone),
        scan((options: QueryOptions<typeof CopySchema.Type>) =>
          rows.query('primary', { pk: {}, '>=': null }, options),
        ).pipe(
          Effect.flatMap((found) =>
            Effect.forEach(
              found.filter(went(gone)),
              ({ key, accountId, machineId, projectId }) =>
                turn.run({
                  key,
                  whose: { accountId, machineId, projectId },
                  does: rows
                    .hardDelete({ key }, CONFIRM)
                    .pipe(Effect.provide(layer), Effect.ignore),
                  skipped: undefined,
                }),
              { discard: true },
            ),
          ),
          Effect.provide(layer),
          Effect.ignore,
        ),
      ),
  });
};

/** Kept copies in this browser's IndexedDB; the database of before goes. */
export const idb = Layer.effect(
  Kept,
  Effect.map(Effect.scope, (scope) =>
    make(
      IDB.make(table, {
        database: IDB.database({ databaseName: 'code:kept' }),
        mode: 'disposable',
      }).layer,
      scope,
    ),
  ).pipe(
    Effect.tap(() =>
      IDB.prune({ prefix: 'code:machines', keep: [] }).pipe(Effect.ignore),
    ),
  ),
);

/** Kept copies in memory, for a test. */
export const memory = () => {
  const stored = Memory.make(table).layer;
  return Layer.effect(
    Kept,
    Effect.map(Effect.scope, (scope) => make(stored, scope)),
  );
};
