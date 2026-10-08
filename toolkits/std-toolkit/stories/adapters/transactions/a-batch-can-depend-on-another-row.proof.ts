import { Effect, Schema } from 'effect';
import { Proof } from 'laymos/story';
import { StdTable } from '@kstackz/std-toolkit/db';
import { Memory } from '@kstackz/std-toolkit/db/memory';
import { EntityESchema } from '@kstackz/std-toolkit/eschema';

const Board = EntityESchema.make('Board', 'boardId', {
  archived: Schema.Boolean,
}).build();
const Task = EntityESchema.make('Task', 'taskId', {
  boardId: Schema.String,
  title: Schema.String,
}).build();

const table = StdTable.make('board').primary('pk', 'sk').build();
const board = table
  .entity(Board)
  .primary({ pk: ['boardId'] })
  .build();
const task = table
  .entity(Task)
  .primary({ pk: ['boardId'] })
  .build();

// Add a task only if its board exists and is not archived.
const addTo = (boardId: string, taskId: string) =>
  Effect.gen(function* () {
    const boardIsOpen = yield* board.getAndCheckOp(
      { boardId },
      (current) => !current.archived,
    );
    const add = yield* task.insertOp({ taskId, boardId, title: 'New' });
    return yield* table.transact([boardIsOpen, add]).pipe(
      Effect.match({
        onFailure: (error) =>
          error.reason._tag === 'TransactFailed'
            ? error.reason.operations.map(({ status }) => status).join()
            : error.reason._tag,
        onSuccess: ([checked, added]) =>
          `committed: check=${checked}, added=${added.value.taskId}`,
      }),
    );
  });

export default Proof.make({
  title: 'A batch can write only while another row still holds',
  description:
    'getAndCheckOp reads the board at commit time and applies the invariant; the check writes nothing and yields null in the result.',
  prepare: Effect.gen(function* () {
    const db = Memory.make(table);
    const boards = yield* Effect.all([
      board.insert({ boardId: 'work', archived: false }),
      board.insert({ boardId: 'old', archived: true }),
    ]).pipe(Effect.provide(db.layer));
    yield* Proof.assert(
      'one open and one archived board exist; "gone" was never created',
      boards.map(({ value }) => `${value.boardId}:${value.archived}`).join() ===
        'work:false,old:true',
    );
    return { db, boards: boards.map(({ value }) => value) };
  }),
  act: ({ db }) =>
    Effect.gen(function* () {
      const open = yield* addTo('work', 't1');
      const archived = yield* addTo('old', 't2');
      const missing = yield* addTo('gone', 't3');
      const stored = yield* Effect.all([
        task.get({ boardId: 'work', taskId: 't1' }),
        task.get({ boardId: 'old', taskId: 't2' }),
        task.get({ boardId: 'gone', taskId: 't3' }),
      ]);
      return {
        open,
        archived,
        missing,
        stored: stored.map((entity) => entity?.value.taskId ?? null),
      };
    }).pipe(Effect.provide(db.layer)),
  verify: ({ open, archived, missing, stored }) =>
    Effect.gen(function* () {
      yield* Proof.assert(
        'the open board takes the task, and the check yields null',
        open === 'committed: check=null, added=t1',
      );
      yield* Proof.assert(
        'the archived board refuses',
        archived === 'refused,not-evaluated',
      );
      yield* Proof.assert(
        'a board that does not exist is missing',
        missing === 'missing,not-evaluated',
      );
      yield* Proof.assert(
        'only the task on the open board was written',
        stored.join() === 't1,,',
      );
    }),
});
