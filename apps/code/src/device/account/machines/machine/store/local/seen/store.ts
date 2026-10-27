import { Effect, Layer, Schema, type Scope } from 'effect';
import {
  type QueryOptions,
  StdTable,
  type StdTableService,
} from '@kestack/std-toolkit/db';
import { IDB } from '@kestack/std-toolkit/db/idb';
import { Memory } from '@kestack/std-toolkit/db/memory';
import { EntityESchema } from '@kestack/std-toolkit/eschema';
import { machine } from '../../../../store.ts';
import { Seen } from './seen.ts';
import {
  broadcast,
  type Gone,
  keyOf,
  placed,
  RETRIES,
  scan,
  turns,
  went,
} from '../../../../../store/rows/index.ts';

/*
 * The Unseen marks in this browser's IndexedDB, local storage in the
 * `seen` table of each Machine's database: one row per Session seen, the
 * end time of the last Turn seen, and its Project, so it goes with it.
 *
 * 1. Read    every mark of the Machine.
 * 2. Mark    a mark only moves forward: an older Turn seen late changes
 *            nothing. Marks of a Session run one at a time, in this
 *            Layer's own Scope, and each rings its database's doorbell; a
 *            write that fails is lost.
 * 3. Follow  every write, in this tab or another, as a change to read
 *            again.
 * 4. Drop    a Project removed: its marks go, once those under way are
 *            made. A Machine forgotten: those under way are made or
 *            dropped, and its marks go with its database (`Storage`).
 */

const MarkSchema = EntityESchema.make('UnseenMark', 'sessionId', {
  projectId: Schema.String,
  /** When the last Turn seen ended, in ms since the epoch; 0 before any. */
  seen: Schema.Finite,
}).build();

const TABLE = 'seen';
const CONFIRM = 'I KNOW WHAT I AM DOING';

const table = StdTable.make(TABLE).primary('pk', 'sk').build();

const marks = table.entity(MarkSchema).primary().build();

const all = scan((options: QueryOptions<typeof MarkSchema.Type>) =>
  marks.query('primary', { pk: {}, '>=': null }, options),
);

/** Whose a mark is, as a Gone judges it. */
interface Whose {
  readonly accountId: string;
  readonly machineId: string;
  readonly projectId: string;
}

const make = (
  layerOf: (database: string) => Layer.Layer<StdTableService<typeof TABLE>>,
  scope: Scope.Scope,
) => {
  // 2. Mark and 4. Drop: in turn for each Session.
  const turn = turns<Whose>(scope);

  return Seen.of({
    // 1. Read
    read: (accountId, machineId) =>
      Effect.map(all, (found) =>
        Object.fromEntries(
          found.map(({ sessionId, seen }) => [sessionId, seen]),
        ),
      ).pipe(Effect.provide(layerOf(machine(accountId, machineId)))),
    // 2. Mark
    mark: (accountId, machineId, projectId, sessionId, seen) => {
      const database = machine(accountId, machineId);
      return turn.run({
        key: keyOf(database, sessionId),
        whose: { accountId, machineId, projectId },
        does: Effect.gen(function* () {
          const mark = yield* marks.get({ sessionId });
          if (mark === null)
            yield* marks.insert({ sessionId, projectId, seen });
          else if (mark.value.seen < seen)
            // Judged again on the mark as written, since another tab may
            // have moved it on after it was read here.
            yield* marks.getAndUpdate(
              { sessionId },
              (current) => ({ seen: Math.max(current.seen, seen) }),
              { retries: RETRIES },
            );
          else return;
          yield* broadcast(database).ring;
        }).pipe(
          Effect.retry({ times: RETRIES }),
          Effect.provide(layerOf(database)),
          Effect.ignore,
        ),
        skipped: undefined,
      });
    },
    // 3. Follow
    changes: (accountId, machineId) =>
      broadcast(machine(accountId, machineId)).rings,
    // 4. Drop
    drop: (gone: Gone) => {
      const database = machine(gone.accountId, gone.machineId);
      return turn.drop(
        went(gone),
        gone._tag === 'Machine'
          ? Effect.void
          : Effect.flatMap(all, (found) =>
              Effect.forEach(
                found.filter(({ projectId }) => projectId === gone.projectId),
                ({ sessionId }) => marks.hardDelete({ sessionId }, CONFIRM),
                { discard: true },
              ),
            ).pipe(
              Effect.andThen(broadcast(database).ring),
              Effect.provide(layerOf(database)),
              Effect.ignore,
            ),
      );
    },
  });
};

/** The Unseen marks in this browser's IndexedDB, each Machine's in its own database. */
export const idb = Layer.effect(
  Seen,
  Effect.map(Effect.scope, (scope) =>
    make(
      placed(
        (database) =>
          IDB.make(table, {
            database: IDB.database({ databaseName: database }),
            mode: 'disposable',
          }).layer,
      ),
      scope,
    ),
  ),
);

/** The Unseen marks in memory, for a test: each Layer built over the same rows. */
export const memory = () => {
  const layerOf = placed(() => Memory.make(table).layer);
  return Layer.effect(
    Seen,
    Effect.map(Effect.scope, (scope) => make(layerOf, scope)),
  );
};
