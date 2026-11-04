import { Effect, Schema, Stream } from 'effect';
import { StdTable } from '@kestack/std-toolkit/db';
import { EntityESchema } from '@kestack/std-toolkit/schema';

// Task at v2, the same in both releases: only the index is new.
const Task = EntityESchema.make('Task', 'taskId', {
  boardId: Schema.String,
  title: Schema.String,
})
  .evolve('v2', { priority: Schema.Literals(['low', 'high']) }, (v1) => ({
    ...v1,
    priority: 'low' as const,
  }))
  .build();

// The last release: the table had a GSI slot, but Task used none.
export const oldTask = StdTable.make('board')
  .primary('pk', 'sk')
  .gsi('GSI1', 'GSI1PK', 'GSI1SK')
  .entity(Task, (e) => e.primary({ pk: ['boardId'] }))
  .build().Task;

// This release names byPriority on that slot.
export const table = StdTable.make('board')
  .primary('pk', 'sk')
  .gsi('GSI1', 'GSI1PK', 'GSI1SK')
  .entity(Task, (e) =>
    e.primary({ pk: ['boardId'] }).index('GSI1', 'byPriority', {
      pk: ['priority'],
      sk: ['boardId', 'title'],
    }),
  )
  .build();
export const task = table.Task;

// What setup does underneath: check every row, and write the new keys of
// the ones that drifted. The stored value and its version stay as they are.
export const reindexAll = Stream.runForEach(table.scan(), (item) =>
  Effect.gen(function* () {
    const { drifted, currentForm } = yield* table.drift(item);
    if (drifted) yield* table.reindex({ ...item, keys: currentForm.keys });
  }),
);
