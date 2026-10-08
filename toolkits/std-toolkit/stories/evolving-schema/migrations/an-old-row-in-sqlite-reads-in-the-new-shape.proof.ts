import { Effect, Schema, Stream } from 'effect';
import { Proof } from 'laymos/story';
import { StdTable } from '@kstackz/std-toolkit/db';
import { SQLite } from '@kstackz/std-toolkit/db/sqlite';
import { makeNodeSQLite } from '@kstackz/std-toolkit/db/sqlite/node';
import { EntityESchema } from '@kstackz/std-toolkit/eschema';

const TaskV1 = EntityESchema.make('Task', 'taskId', {
  boardId: Schema.String,
  title: Schema.String,
  dueAt: Schema.NullOr(Schema.String),
}).build();
// v2 turns the stored ISO string into a Date in code; storage keeps a string.
const Task = EntityESchema.make('Task', 'taskId', {
  boardId: Schema.String,
  title: Schema.String,
  dueAt: Schema.NullOr(Schema.String),
})
  .evolve(
    'v2',
    { dueAt: null, due: Schema.NullOr(Schema.DateFromString) },
    ({ dueAt, ...v1 }) => ({
      ...v1,
      due: dueAt === null ? null : new Date(dueAt),
    }),
  )
  .build();

const lastRelease = StdTable.make('board').primary('pk', 'sk').build();
const oldTask = lastRelease
  .entity(TaskV1)
  .primary({ pk: ['boardId'] })
  .build();
const table = StdTable.make('board').primary('pk', 'sk').build();
const task = table
  .entity(Task)
  .primary({ pk: ['boardId'] })
  .build();

const key = { boardId: 'work', taskId: 't1' };

export default Proof.make({
  title: 'An old row in SQLite reads in the new shape and is saved back in it',
  description:
    'The same migration on a real database: node:sqlite through the shipped driver.',
  critical: true,
  prepare: Effect.gen(function* () {
    const database = makeNodeSQLite({ path: ':memory:' });
    yield* Effect.addFinalizer(() => Effect.sync(() => database.close?.()));
    yield* SQLite.setup(table, { database });
    // Both releases open the same database.
    const lastReleaseDb = SQLite.make(lastRelease, { database });
    const db = SQLite.make(table, { database });
    yield* oldTask
      .insert({ ...key, title: 'Ship', dueAt: '2026-09-01T09:00:00.000Z' })
      .pipe(Effect.provide(lastReleaseDb.layer));
    const [stored] = yield* Stream.runCollect(table.scan()).pipe(
      Effect.provide(db.layer),
    );
    yield* Proof.assert(
      'the SQLite row is v1 with the old field',
      stored?.data._v === 'v1' && 'dueAt' in stored.data,
    );
    return { db, storedBefore: stored };
  }),
  act: ({ db }) =>
    Effect.gen(function* () {
      const read = yield* task.get(key);
      const written = yield* task.getAndUpdate(key, { title: 'Ship it' });
      const [storedAfter] = yield* Stream.runCollect(table.scan());
      return { read, written, storedAfter };
    }).pipe(Effect.provide(db.layer)),
  verify: ({ read, storedAfter }) =>
    Effect.gen(function* () {
      yield* Proof.assert(
        'the old string became a Date in the v2 value',
        read?.value.due instanceof Date &&
          read.value.due.toISOString() === '2026-09-01T09:00:00.000Z',
      );
      yield* Proof.assert(
        'the row is stored at v2, the date as its ISO string',
        storedAfter?.data._v === 'v2' &&
          storedAfter.data.due === '2026-09-01T09:00:00.000Z' &&
          !('dueAt' in storedAfter.data),
      );
    }),
});
