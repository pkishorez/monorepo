import { Effect, Schema } from 'effect';
import { Proof } from 'laymos/story';
import { StdTable } from '@kstackz/std-toolkit/db';
import { Memory } from '@kstackz/std-toolkit/db/memory';
import { EntityESchema } from '@kstackz/std-toolkit/eschema';

const Task = EntityESchema.make('Task', 'taskId', {
  boardId: Schema.String,
  title: Schema.String,
  status: Schema.Literals(['open', 'done']),
}).build();

const table = StdTable.make('board').primary('pk', 'sk').build();
const task = table
  .entity(Task)
  .primary({ pk: ['boardId'] })
  .build();

const key = { boardId: 'work', taskId: 't1' };

export default Proof.make({
  title:
    'An update changes only the fields it names and moves the update stamp',
  prepare: Effect.gen(function* () {
    const db = Memory.make(table);
    const before = yield* task
      .insert({ ...key, title: 'Write the plan', status: 'open' })
      .pipe(Effect.provide(db.layer));
    yield* Proof.assert('the task starts open', before.value.status === 'open');
    return { db, before };
  }),
  act: ({ db }) =>
    Effect.gen(function* () {
      const updated = yield* task.getAndUpdate(key, { status: 'done' });
      const renamed = yield* task.getAndUpdate(key, (current) => ({
        title: `${current.title} (v2)`,
      }));
      const stored = yield* task.get(key);
      return { updated, renamed, stored };
    }).pipe(Effect.provide(db.layer)),
  verify: ({ updated, stored }, { before }) =>
    Effect.gen(function* () {
      yield* Proof.assert(
        'the partial changed status and kept the title',
        updated.value.status === 'done' &&
          updated.value.title === 'Write the plan',
      );
      yield* Proof.assert(
        'a callback update read the current value',
        stored?.value.title === 'Write the plan (v2)' &&
          stored.value.status === 'done',
      );
      yield* Proof.assert(
        'every write moved the update stamp forward',
        before.meta._u < updated.meta._u &&
          updated.meta._u < (stored?.meta._u ?? ''),
      );
      yield* Proof.budget('StdTable.getAndUpdate', '50 millis');
    }),
});
