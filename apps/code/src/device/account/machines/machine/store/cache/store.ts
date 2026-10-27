import { Effect, Layer, Schema, type Scope } from 'effect';
import {
  type QueryOptions,
  StdTable,
  type StdTableService,
} from '@kestack/std-toolkit/db';
import { IDB } from '@kestack/std-toolkit/db/idb';
import { Memory } from '@kestack/std-toolkit/db/memory';
import { EntityESchema } from '@kestack/std-toolkit/eschema';
import { account } from '../../../../store/index.ts';
import { machine } from '../../../store.ts';
import {
  type Gone,
  keyOf,
  placed,
  RETRIES,
  scan,
  turns,
  upsert,
  went,
} from '../../../../store/rows/index.ts';
import {
  Cache,
  machineTables,
  type Shelf,
  type Table,
  type Whose,
} from './cache.ts';

/*
 * The cache in this browser's IndexedDB: each kind of copy a table of the
 * database of whose it is, an Account's Machine List in `machines` of
 * `code:account:<accountId>`, a Machine's setup and its Projects' Skills
 * in `setup` and `skills` of the Machine's, so each goes with its
 * database. A row holds the copy's JSON and the version of its shape.
 * Nothing here is the truth.
 *
 * 1. Read    a row kept at another version, or that no longer reads, reads
 *            as nothing.
 * 2. Write   replaces the row, or makes it; the writes of a row run one at
 *            a time, in the order asked, and one asked before its owner
 *            went is not made.
 * 3. Drop    a Project removed: its rows go from its Machine's tables, once
 *            the writes of them under way are made, so a row just made
 *            goes too. A Machine forgotten: the writes under way are made
 *            or dropped, and its rows go with its database (`Storage`).
 */

const CopySchema = EntityESchema.make('CachedCopy', 'key', {
  projectId: Schema.NullOr(Schema.String),
  version: Schema.Finite,
  json: Schema.String,
}).build();

const CONFIRM = 'I KNOW WHAT I AM DOING';

/** One table of copies, and its rows. */
const kept = (name: Table) => {
  const table = StdTable.make(name).primary('pk', 'sk').build();
  return { table, rows: table.entity(CopySchema).primary().build() };
};

const tables = {
  machines: kept('machines'),
  setup: kept('setup'),
  skills: kept('skills'),
};

type Service = StdTableService<Table>;

/** The database a copy is kept in: its Machine's, or with none its Account's. */
const databaseOf = ({ accountId, machineId }: Whose) =>
  machineId === null ? account(accountId) : machine(accountId, machineId);

/** A row's key in its table: its Project's id, or with none the table's name. */
const keyIn = (shelf: Shelf<unknown>, whose: Whose) =>
  whose.projectId ?? shelf.name;

/** Whether a copy went: one of no Machine never does. */
const judged =
  (gone: Gone) =>
  ({ accountId, machineId, projectId }: Whose) =>
    machineId !== null && went(gone)({ accountId, machineId, projectId });

const make = (
  layerOf: (table: Table, database: string) => Layer.Layer<Service>,
  scope: Scope.Scope,
) => {
  // 2. Write and 3. Drop: in turn for each row.
  const turn = turns<Whose>(scope);

  return Cache.of({
    // 1. Read
    read: (shelf, whose) =>
      tables[shelf.name].rows.get({ key: keyIn(shelf, whose) }).pipe(
        Effect.flatMap((row) =>
          row === null || row.value.version !== shelf.version
            ? Effect.succeed(null)
            : Schema.decodeUnknownEffect(shelf.json)(row.value.json),
        ),
        Effect.provide(layerOf(shelf.name, databaseOf(whose))),
        Effect.orElseSucceed(() => null),
      ),
    // 2. Write
    write: (shelf, whose, value) => {
      const { rows } = tables[shelf.name];
      const database = databaseOf(whose);
      const key = keyIn(shelf, whose);
      return turn.run({
        key: keyOf(database, shelf.name, key),
        whose,
        does: Effect.gen(function* () {
          const json = yield* Schema.encodeEffect(shelf.json)(value);
          const fields = { version: shelf.version, json };
          yield* upsert({
            get: rows.get({ key }),
            insert: rows.insert({ key, projectId: whose.projectId, ...fields }),
            update: () =>
              rows.getAndUpdate({ key }, () => fields, { retries: RETRIES }),
          });
        }).pipe(Effect.provide(layerOf(shelf.name, database)), Effect.ignore),
        skipped: undefined,
      });
    },
    // 3. Drop
    drop: (gone) => {
      const database = machine(gone.accountId, gone.machineId);
      return turn.drop(
        judged(gone),
        gone._tag === 'Machine'
          ? Effect.void
          : Effect.forEach(
              machineTables,
              (name) => {
                const { rows } = tables[name];
                return scan((options: QueryOptions<typeof CopySchema.Type>) =>
                  rows.query('primary', { pk: {}, '>=': null }, options),
                ).pipe(
                  Effect.flatMap((found) =>
                    Effect.forEach(
                      found.filter(
                        ({ projectId }) => projectId === gone.projectId,
                      ),
                      ({ key }) => rows.hardDelete({ key }, CONFIRM),
                      { discard: true },
                    ),
                  ),
                  Effect.provide(layerOf(name, database)),
                  Effect.ignore,
                );
              },
              { discard: true },
            ),
      );
    },
  });
};

/** One table's Layer in one database of this browser's IndexedDB. */
const layerIn = (name: Table, database: string): Layer.Layer<Service> =>
  IDB.make(tables[name].table, {
    database: IDB.database({ databaseName: database }),
    mode: 'disposable',
  }).layer;

/** The cache in this browser's IndexedDB. */
export const idb = Layer.effect(
  Cache,
  Effect.map(Effect.scope, (scope) => {
    const each = {
      machines: placed((database) => layerIn('machines', database)),
      setup: placed((database) => layerIn('setup', database)),
      skills: placed((database) => layerIn('skills', database)),
    };
    return make((name, database) => each[name](database), scope);
  }),
);

/** The cache in memory, for a test: each Layer built over the same rows. */
export const memory = () => {
  const each = {
    machines: placed(() => Memory.make(tables.machines.table).layer),
    setup: placed(() => Memory.make(tables.setup.table).layer),
    skills: placed(() => Memory.make(tables.skills.table).layer),
  };
  return Layer.effect(
    Cache,
    Effect.map(Effect.scope, (scope) =>
      make((name, database) => each[name](database), scope),
    ),
  );
};
