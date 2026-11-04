import { Console, Effect, Schema } from 'effect';
import { StdTable } from '@kestack/std-toolkit/db';
import { Memory } from '@kestack/std-toolkit/db/memory';
import { EntityESchema } from '@kestack/std-toolkit/schema';

const Task = EntityESchema.make('Task', 'taskId', {
  boardId: Schema.String,
  title: Schema.String,
})
  .evolve('v2', { priority: Schema.Literals(['low', 'high']) }, (v1) => ({
    ...v1,
    priority: 'low' as const,
  }))
  .build();

// The Backend: here, a table in memory.
const table = StdTable.make('board')
  .primary('pk', 'sk')
  .entity(Task, (e) => e.primary({ pk: ['boardId'] }))
  .build();
const task = table.Task;

// The onInsert you give a Collection: it gets plain values, in today's
// shape, and returns what the Backend saved.
const onInsert = (items: ReadonlyArray<typeof Task.Type>) =>
  Effect.forEach(items, (item) => task.insert(item));

export const program = Effect.gen(function* () {
  // What the screen added: shown at once, as an Optimistic Entity.
  const added = [
    { boardId: 'work', taskId: 't1', title: 'Call home', priority: 'high' },
  ] as const;
  yield* Console.log('the screen adds', added);

  // Sync calls your callback with those values.
  const saved = yield* onInsert(added);
  yield* Console.log('the Backend saved', saved);

  // What comes back is a whole Entity: the value, and its meta with the
  // _u the Backend gave it. It goes into the copy, and the optimistic one
  // is dropped.
  return saved[0]!.meta;
}).pipe(Effect.provide(Memory.make(table).layer));
