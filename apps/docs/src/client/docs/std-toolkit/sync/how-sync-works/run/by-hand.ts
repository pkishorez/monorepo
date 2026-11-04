import { Console, Effect, Schema } from 'effect';
import { StdTable } from '@kestack/std-toolkit/db';
import { Memory } from '@kestack/std-toolkit/db/memory';
import { EntityESchema } from '@kestack/std-toolkit/schema';

// Release 1 saved tasks with a title. Today's release adds a priority.
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

const oldTask = StdTable.make('board')
  .primary('pk', 'sk')
  .entity(TaskV1, (e) => e.primary({ pk: ['boardId'] }))
  .build().Task;
const table = StdTable.make('board')
  .primary('pk', 'sk')
  .entity(Task, (e) => e.primary({ pk: ['boardId'] }))
  .build();
const task = table.Task;

type Saved = Effect.Success<ReturnType<typeof task.insert>>;

// The Backend's one question: which tasks changed after this _u? Oldest
// first, and strictly after it.
const changesAfter = (cursor: string | null) =>
  task
    .query('primary', { pk: { boardId: 'work' }, '>=': null })
    .pipe(
      Effect.map((page) =>
        page.items
          .filter((item) => cursor === null || item.meta._u > cursor)
          .toSorted((a, b) => (a.meta._u < b.meta._u ? -1 : 1)),
      ),
    );

// The device's copy: each task by id, and the newest _u it has seen.
const copy = new Map<string, Saved>();
let cursor: string | null = null;

// A newer _u wins; an older or equal one changes nothing.
const keep = (entity: Saved) => {
  const held = copy.get(entity.value.taskId);
  if (held && held.meta._u >= entity.meta._u) return 'ignored';
  copy.set(entity.value.taskId, entity);
  return 'kept';
};

const pull = Effect.gen(function* () {
  const changes = yield* changesAfter(cursor);
  for (const entity of changes) keep(entity);
  cursor = changes.at(-1)?.meta._u ?? cursor;
  yield* Console.log('pulled', changes);
  yield* Console.log(
    'copy',
    [...copy.values()].map((entity) => entity.value),
  );
});

export const program = Effect.gen(function* () {
  copy.clear();
  cursor = null;
  // One task saved long ago by release 1, one saved today.
  yield* oldTask.insert({
    boardId: 'work',
    taskId: 't1',
    title: 'Plan the week',
  });
  yield* task.insert({
    boardId: 'work',
    taskId: 't2',
    title: 'Water the plants',
    priority: 'high',
  });

  yield* Console.log('first pull: everything');
  yield* pull;
  const before = copy.get('t1')!;

  yield* Console.log('an edit on the Backend');
  yield* task.getAndUpdate(
    { boardId: 'work', taskId: 't1' },
    { title: 'Plan the month' },
  );

  yield* Console.log('second pull: only what is after the cursor');
  yield* pull;

  yield* Console.log('an old copy of t1 turns up from another tab');
  return keep(before);
}).pipe(Effect.provide(Memory.make(table).layer));
