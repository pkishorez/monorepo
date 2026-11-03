import { Effect, Schema } from 'effect';
import { StdTable } from '@kestack/std-toolkit/db';
import { EntityESchema } from '@kestack/std-toolkit/eschema';

const Task = EntityESchema.make('Task', 'taskId', {
  boardId: Schema.String,
  title: Schema.String,
}).build();

export const table = StdTable.make('board').primary('pk', 'sk').build();
export const task = table
  .entity(Task)
  .primary({ pk: ['boardId'] })
  .build();

// A key can't change in an update, so a move is an insert on the new board
// and a delete on the old one, committed together.
export const moveToHome = (taskId: string) =>
  Effect.gen(function* () {
    const onWork = yield* task.get({ boardId: 'work', taskId });
    if (onWork === null) return yield* Effect.fail(`${taskId} is not on work`);
    const arrive = yield* task.insertOp({ ...onWork.value, boardId: 'home' });
    const leave = yield* task.deleteOp({ boardId: 'work', taskId });
    return yield* table.transact([arrive, leave]);
  });
