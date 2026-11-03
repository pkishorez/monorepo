import { Effect, Schema, Stream } from 'effect';
import { StdTable } from '@kestack/std-toolkit/db';
import { EntityESchema } from '@kestack/std-toolkit/eschema';

const Task = EntityESchema.make('Task', 'taskId', {
  boardId: Schema.String,
  title: Schema.String,
  status: Schema.Literals(['open', 'done']),
}).build();

// The last release: a GSI slot on the table, but no pattern using it.
const lastRelease = StdTable.make('board')
  .primary('pk', 'sk')
  .gsi('GSI1', 'GSI1PK', 'GSI1SK')
  .build();
export const oldTask = lastRelease
  .entity(Task)
  .primary({ pk: ['boardId'] })
  .build();

// This release adds byStatus on GSI1.
export const table = StdTable.make('board')
  .primary('pk', 'sk')
  .gsi('GSI1', 'GSI1PK', 'GSI1SK')
  .build();
export const task = table
  .entity(Task)
  .primary({ pk: ['boardId'] })
  .index('GSI1', 'byStatus', { pk: ['status'], sk: ['title'] })
  .build();

// Every row the table holds: drift checks each, reindex repairs those that drifted.
export const reindexAll = Stream.runForEach(table.scan(), (item) =>
  Effect.gen(function* () {
    const { drifted, currentForm } = yield* table.drift(item);
    if (drifted) yield* table.reindex(currentForm);
  }),
);
