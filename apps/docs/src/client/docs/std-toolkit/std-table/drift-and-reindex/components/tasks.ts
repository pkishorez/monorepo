import { Effect, Schema, Stream } from 'effect';
import { StdTable } from '@kestack/std-toolkit/db';
import { EntityESchema } from '@kestack/std-toolkit/eschema';

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
const lastRelease = StdTable.make('board')
  .primary('pk', 'sk')
  .gsi('GSI1', 'GSI1PK', 'GSI1SK')
  .build();
export const oldTask = lastRelease
  .entity(Task)
  .primary({ pk: ['boardId'] })
  .build();

// This release names byPriority on that slot.
export const table = StdTable.make('board')
  .primary('pk', 'sk')
  .gsi('GSI1', 'GSI1PK', 'GSI1SK')
  .build();
export const task = table
  .entity(Task)
  .primary({ pk: ['boardId'] })
  .index('GSI1', 'byPriority', { pk: ['priority'], sk: ['boardId', 'title'] })
  .build();

// The backfill: check every row, and repair the ones that drifted.
export const reindexAll = Stream.runForEach(table.scan(), (item) =>
  Effect.gen(function* () {
    const { drifted, currentForm } = yield* table.drift(item);
    if (drifted) yield* table.reindex(currentForm);
  }),
);
