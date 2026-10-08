import { Effect, Schema } from 'effect';
import { Proof } from 'laymos/story';
import { StdTable } from '@kstackz/std-toolkit/db';
import { Memory } from '@kstackz/std-toolkit/db/memory';
import { EntityESchema } from '@kstackz/std-toolkit/eschema';

const Task = EntityESchema.make('Task', 'taskId', {
  boardId: Schema.String,
  title: Schema.String,
}).build();

const table = StdTable.make('board').primary('pk', 'sk').build();
const task = table
  .entity(Task)
  .primary({ pk: ['boardId'] })
  .build();
const otherTable = StdTable.make('archive').primary('pk', 'sk').build();
const archivedTask = otherTable
  .entity(Task)
  .primary({ pk: ['boardId'] })
  .build();

const reasonOf = <A, R>(
  batch: Effect.Effect<A, { readonly reason: { readonly _tag: string } }, R>,
) =>
  batch.pipe(
    Effect.match({
      onFailure: (error) => error.reason._tag,
      onSuccess: () => 'committed',
    }),
  );

export default Proof.make({
  title:
    'A batch DynamoDB would refuse is refused on Memory too, before anything is written',
  description:
    'Two ops on one item, more than 100 ops, or an op from another table: the same program must fail the same way on every adapter.',
  prepare: Effect.gen(function* () {
    const db = Memory.make(table);
    const archive = Memory.make(otherTable);
    const t1 = yield* task
      .insert({ taskId: 't1', boardId: 'work', title: 'Plan' })
      .pipe(Effect.provide(db.layer));
    yield* Proof.assert(
      't1 exists with its first title',
      t1.value.title === 'Plan',
    );
    return { db, archive, t1 };
  }),
  act: ({ db, archive }) =>
    Effect.gen(function* () {
      const key = { boardId: 'work', taskId: 't1' };
      const sameItemTwice = yield* reasonOf(
        Effect.gen(function* () {
          const rename = yield* task.getAndUpdateOp(key, { title: 'Renamed' });
          const guard = yield* task.existsOp(key);
          return yield* table.transact([rename, guard]);
        }),
      );
      const tooMany = yield* reasonOf(
        Effect.gen(function* () {
          const ops = yield* Effect.forEach(
            Array.from({ length: 101 }, (_, i) => `n${i}`),
            (taskId) =>
              task.insertOp({ taskId, boardId: 'bulk', title: taskId }),
          );
          return yield* table.transact(ops);
        }),
      );
      const foreign = yield* reasonOf(
        Effect.gen(function* () {
          const op = yield* archivedTask
            .insertOp({ taskId: 'a1', boardId: 'work', title: 'Old' })
            .pipe(Effect.provide(archive.layer));
          return yield* table.transact([op as never]);
        }),
      );
      const stored = yield* task.get(key);
      const bulk = yield* task.query('primary', {
        pk: { boardId: 'bulk' },
        '>=': null,
      });
      return {
        sameItemTwice,
        tooMany,
        foreign,
        title: stored?.value.title,
        bulkWritten: bulk.items.length,
      };
    }).pipe(Effect.provide(db.layer)),
  verify: ({ sameItemTwice, tooMany, foreign, title, bulkWritten }) =>
    Effect.gen(function* () {
      yield* Proof.assert(
        'two ops on one item fail as DuplicateTransactionTarget',
        sameItemTwice === 'DuplicateTransactionTarget',
      );
      yield* Proof.assert(
        '101 ops fail as TransactionTooLarge',
        tooMany === 'TransactionTooLarge',
      );
      yield* Proof.assert(
        'an op from another table fails as ForeignTransactionItem',
        foreign === 'ForeignTransactionItem',
      );
      yield* Proof.assert(
        'nothing was written',
        title === 'Plan' && bulkWritten === 0,
      );
    }),
});
