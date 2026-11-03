import { Console, Effect, Schema } from 'effect';
import { StdTable } from '@kestack/std-toolkit/db';
import { EntityESchema } from '@kestack/std-toolkit/eschema';
import { TableSnapshot } from '@kestack/std-toolkit/snapshot';

const fields = { boardId: Schema.String, title: Schema.String };
const priority = Schema.Literals(['low', 'high']);

// A fresh 'board' table: each release defines its own.
const boardTable = () =>
  StdTable.make('board')
    .primary('pk', 'sk')
    .gsi('GSI1', 'GSI1PK', 'GSI1SK')
    .build();

// What you shipped: Task at v1.
const shipped = boardTable();
shipped
  .entity(EntityESchema.make('Task', 'taskId', fields).build())
  .primary({ pk: ['boardId'] })
  .build();

// Next release, one way: priority added as v2.
const addedAVersion = boardTable();
addedAVersion
  .entity(
    EntityESchema.make('Task', 'taskId', fields)
      .evolve('v2', { priority }, (v1) => ({ ...v1, priority: 'low' as const }))
      .build(),
  )
  .primary({ pk: ['boardId'] })
  .build();

// Another way: priority written straight into v1.
const editedV1 = boardTable();
editedV1
  .entity(EntityESchema.make('Task', 'taskId', { ...fields, priority }).build())
  .primary({ pk: ['boardId'] })
  .build();

// A third: a new index, byTitle.
const addedAnIndex = boardTable();
addedAnIndex
  .entity(EntityESchema.make('Task', 'taskId', fields).build())
  .primary({ pk: ['boardId'] })
  .index('GSI1', 'byTitle', { pk: ['boardId'], sk: ['title'] })
  .build();

const accepted = TableSnapshot.capture(shipped);

export const program = Effect.forEach(
  [
    ['priority added as v2', addedAVersion],
    ['priority written into v1', editedV1],
    ['a byTitle index added', addedAnIndex],
  ] as const,
  ([change, table]) =>
    Console.log(
      `${change}:\n${TableSnapshot.renderChanges(
        TableSnapshot.diff(accepted, TableSnapshot.capture(table)),
      )}`,
    ),
  { discard: true },
);
