import { Effect, Schema, Stream } from 'effect';
import { Proof } from 'laymos/story';
import { StdTable } from '@kstackz/std-toolkit/db';
import { Memory } from '@kstackz/std-toolkit/db/memory';
import { EntityESchema } from '@kstackz/std-toolkit/eschema';

// Release 1 stored tasks at v1.
const TaskV1 = EntityESchema.make('Task', 'taskId', {
  boardId: Schema.String,
  title: Schema.String,
  colour: Schema.String,
}).build();
// Release 3: v2 added priority, v3 renamed colour to color.
const Task = EntityESchema.make('Task', 'taskId', {
  boardId: Schema.String,
  title: Schema.String,
  colour: Schema.String,
})
  .evolve('v2', { priority: Schema.Literals(['low', 'high']) }, (v1) => ({
    ...v1,
    priority: 'low' as const,
  }))
  .evolve(
    'v3',
    { colour: null, color: Schema.String },
    ({ colour, ...v2 }) => ({
      ...v2,
      color: colour,
    }),
  )
  .build();

// Two releases of the app over the same logical table.
const release1 = StdTable.make('board').primary('pk', 'sk').build();
const oldTask = release1
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
  title:
    'A task saved at version 1 reads as version 3, and the stored row is left as it was',
  critical: true,
  prepare: Effect.gen(function* () {
    const db = Memory.make(table);
    const written = yield* oldTask
      .insert({ ...key, title: 'Plan', colour: 'blue' })
      .pipe(Effect.provide(db.layer));
    const [stored] = yield* Stream.runCollect(table.scan()).pipe(
      Effect.provide(db.layer),
    );
    yield* Proof.assert(
      'release 1 stored the row at v1',
      stored?.data._v === 'v1',
    );
    return { db, written, storedBefore: stored };
  }),
  act: ({ db }) =>
    Effect.gen(function* () {
      const read = yield* task.get(key);
      const [storedAfter] = yield* Stream.runCollect(table.scan());
      return { read, storedAfter };
    }).pipe(Effect.provide(db.layer)),
  verify: ({ read, storedAfter }, { written }) =>
    Effect.gen(function* () {
      yield* Proof.assert(
        'the value is the v3 shape with every migration applied',
        read?.value.priority === 'low' &&
          read.value.color === 'blue' &&
          !('colour' in read.value),
      );
      yield* Proof.assert('the entity reports v3', read?.meta._v === 'v3');
      yield* Proof.assert(
        'the update stamp is the one release 1 wrote',
        read?.meta._u === written.meta._u,
      );
      yield* Proof.assert(
        'a read never rewrites storage: the row is still v1',
        storedAfter?.data._v === 'v1',
      );
    }),
});
