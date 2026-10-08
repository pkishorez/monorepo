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

export default Proof.make({
  title: 'A batch with one refused write writes nothing at all',
  description:
    'transact applies every op or none, and the failure reports one status per op so the caller can see which one refused.',
  critical: true,
  prepare: Effect.gen(function* () {
    const db = Memory.make(table);
    yield* task
      .insert({ taskId: 't1', boardId: 'work', title: 'Plan', status: 'open' })
      .pipe(Effect.provide(db.layer));
    yield* task
      .insert({
        taskId: 't2',
        boardId: 'work',
        title: 'Review',
        status: 'open',
      })
      .pipe(Effect.provide(db.layer));
    const before = yield* task
      .query('primary', { pk: { boardId: 'work' }, '>=': null })
      .pipe(Effect.provide(db.layer));
    yield* Proof.assert('two open tasks exist', before.items.length === 2);
    return { db, before: before.items.map(({ value }) => value) };
  }),
  act: ({ db }) =>
    Effect.gen(function* () {
      const finish = yield* task.getAndUpdateOp(
        { boardId: 'work', taskId: 't1' },
        { status: 'done' },
      );
      const add = yield* task.insertOp({
        taskId: 't3',
        boardId: 'work',
        title: 'Ship',
        status: 'open',
      });
      // t2 already exists: this op refuses.
      const duplicate = yield* task.insertOp({
        taskId: 't2',
        boardId: 'work',
        title: 'Again',
        status: 'open',
      });
      const statuses = yield* table.transact([finish, add, duplicate]).pipe(
        Effect.match({
          onFailure: (error) =>
            error.reason._tag === 'TransactFailed'
              ? error.reason.operations.map(({ status, detail }) =>
                  detail ? `${status} (${detail})` : status,
                )
              : [error.reason._tag],
          onSuccess: () => null,
        }),
      );
      const after = yield* task.query('primary', {
        pk: { boardId: 'work' },
        '>=': null,
      });
      return { statuses, after: after.items.map(({ value }) => value) };
    }).pipe(Effect.provide(db.layer)),
  verify: ({ statuses, after }) =>
    Effect.gen(function* () {
      yield* Proof.assert('the batch failed', statuses !== null);
      yield* Proof.assert(
        'the report blames the third op',
        statuses?.[2]?.startsWith('missing') === true,
      );
      yield* Proof.assert(
        't1 is still open',
        after.find(({ taskId }) => taskId === 't1')?.status === 'open',
      );
      yield* Proof.assert('t3 was not added', after.length === 2);
    }),
});
