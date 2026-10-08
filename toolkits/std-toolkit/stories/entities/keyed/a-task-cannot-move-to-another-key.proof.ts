import { Effect, Schema } from 'effect';
import { Proof } from 'laymos/story';
import { StdTable } from '@kstackz/std-toolkit/db';
import { Memory } from '@kstackz/std-toolkit/db/memory';
import { EntityESchema } from '@kstackz/std-toolkit/eschema';

const Task = EntityESchema.make('Task', 'taskId', {
  boardId: Schema.String,
  title: Schema.String,
}).build();

// `boardId` is part of the task's key: it fills the partition key.
const table = StdTable.make('board').primary('pk', 'sk').build();
const task = table
  .entity(Task)
  .primary({ pk: ['boardId'] })
  .build();

const key = { boardId: 'work', taskId: 't1' };

export default Proof.make({
  title: 'An update that would move a task to another key is refused',
  description:
    'Fields in the key are immutable. Moving a task is a delete plus an insert, usually in one transact.',
  prepare: Effect.gen(function* () {
    const db = Memory.make(table);
    const stored = yield* task
      .insert({ ...key, title: 'Write the plan' })
      .pipe(Effect.provide(db.layer));
    yield* Proof.assert(
      'the task lives on the work board',
      stored.value.boardId === 'work',
    );
    return { db, stored };
  }),
  act: ({ db }) =>
    Effect.gen(function* () {
      const reason = yield* task.getAndUpdate(key, { boardId: 'home' }).pipe(
        Effect.match({
          onFailure: (error) => error.reason,
          onSuccess: () => null,
        }),
      );
      const onWork = yield* task.get(key);
      const onHome = yield* task.get({ boardId: 'home', taskId: 't1' });
      return { reason, onWork, onHome };
    }).pipe(Effect.provide(db.layer)),
  verify: ({ reason, onWork, onHome }) =>
    Effect.gen(function* () {
      yield* Proof.assert(
        'the update fails as PrimaryKeyUpdateNotSupported',
        reason?._tag === 'PrimaryKeyUpdateNotSupported',
      );
      yield* Proof.assert(
        'the task is still on work and nothing appeared on home',
        onWork?.value.boardId === 'work' && onHome === null,
      );
    }),
});
