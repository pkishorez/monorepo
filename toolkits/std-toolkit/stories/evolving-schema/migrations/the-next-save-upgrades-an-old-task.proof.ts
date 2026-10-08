import { Effect, Schema, Stream } from 'effect';
import { Proof } from 'laymos/story';
import { StdTable } from '@kstackz/std-toolkit/db';
import { Memory } from '@kstackz/std-toolkit/db/memory';
import { EntityESchema } from '@kstackz/std-toolkit/eschema';

const TaskV1 = EntityESchema.make('Task', 'taskId', {
  boardId: Schema.String,
  title: Schema.String,
}).build();
const Task = EntityESchema.make('Task', 'taskId', {
  boardId: Schema.String,
  title: Schema.String,
})
  .evolve('v2', { priority: Schema.Literals(['low', 'high']) }, (v1) => ({
    ...v1,
    priority: 'low' as const,
  }))
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
  title: 'The next save to an old task stores it at the latest version',
  description:
    'An update merges into the migrated value and writes the whole row back in the latest encoded form.',
  critical: true,
  prepare: Effect.gen(function* () {
    const db = Memory.make(table);
    yield* oldTask
      .insert({ ...key, title: 'Plan' })
      .pipe(Effect.provide(db.layer));
    const [stored] = yield* Stream.runCollect(table.scan()).pipe(
      Effect.provide(db.layer),
    );
    yield* Proof.assert('the row is stored at v1', stored?.data._v === 'v1');
    return { db, storedBefore: stored };
  }),
  act: ({ db }) =>
    Effect.gen(function* () {
      const updated = yield* task.getAndUpdate(key, { title: 'Plan it' });
      const [storedAfter] = yield* Stream.runCollect(table.scan());
      return { updated, storedAfter };
    }).pipe(Effect.provide(db.layer)),
  verify: ({ updated, storedAfter }) =>
    Effect.gen(function* () {
      yield* Proof.assert(
        'the update kept the migrated field',
        updated.value.title === 'Plan it' && updated.value.priority === 'low',
      );
      yield* Proof.assert(
        'the stored row is now v2 with every v2 field',
        storedAfter?.data._v === 'v2' &&
          storedAfter.data.priority === 'low' &&
          storedAfter.data.title === 'Plan it',
      );
    }),
});
