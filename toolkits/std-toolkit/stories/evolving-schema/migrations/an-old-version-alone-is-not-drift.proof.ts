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
table
  .entity(Task)
  .primary({ pk: ['boardId'] })
  .build();

export default Proof.make({
  title:
    'A row that is only on an old version is not drift, and reindex can still upgrade it',
  description:
    'Read migration already heals a version-only difference, so drift does not flag it. A reindex of its current form persists v2 under the same stamp.',
  critical: true,
  prepare: Effect.gen(function* () {
    const db = Memory.make(table);
    const written = yield* oldTask
      .insert({ taskId: 't1', boardId: 'work', title: 'Plan' })
      .pipe(Effect.provide(db.layer));
    const [stored] = yield* Stream.runCollect(table.scan()).pipe(
      Effect.provide(db.layer),
    );
    yield* Proof.assert('the row is stored at v1', stored?.data._v === 'v1');
    return { db, written, stored: stored! };
  }),
  act: ({ db, stored }) =>
    Effect.gen(function* () {
      const checked = yield* table.drift(stored);
      yield* table.reindex(checked.currentForm);
      const [after] = yield* Stream.runCollect(table.scan());
      return {
        drifted: checked.drifted,
        currentForm: checked.currentForm,
        after: after!,
      };
    }).pipe(Effect.provide(db.layer)),
  verify: ({ drifted, after }, { written }) =>
    Effect.gen(function* () {
      yield* Proof.assert(
        'drift does not flag a version-only difference',
        !drifted,
      );
      yield* Proof.assert(
        'the reindexed row is stored at v2',
        after.data._v === 'v2' && after.data.priority === 'low',
      );
      yield* Proof.assert(
        'under the same update stamp',
        after.meta._u === written.meta._u,
      );
    }),
});
