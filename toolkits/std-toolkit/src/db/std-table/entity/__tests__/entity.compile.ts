import { Schema } from 'effect';
import { EntityESchema, ESchema } from '../../../../eschema/index.js';
import { StdTable } from '../../table/index.js';
import type { CheckOp, TableEffect } from '../index.js';

const table = StdTable.make('entity-compile').primary('pk', 'sk').build();

const record = table
  .entity(
    EntityESchema.make('Record', 'recordId', {
      category: Schema.String,
      value: Schema.Number,
    }).build(),
  )
  .primary({ pk: ['category'] })
  .build();

const check = record.getAndCheckOp(
  { recordId: 'record-1', category: 'documents' },
  (current) => current.value > 0,
);
const exactCheck: TableEffect<
  CheckOp<'entity-compile'>,
  'entity-compile'
> = check;

record.getAndCheckOp(
  { recordId: 'record-1', category: 'documents' },
  // @ts-expect-error A get-and-check function must return a boolean.
  () => 1,
);

const settings = table
  .singleEntity(ESchema.make('Settings', { enabled: Schema.Boolean }).build())
  .default({ enabled: true });

// @ts-expect-error Single entities do not support get-and-check.
settings.getAndCheckOp({}, () => true);

void exactCheck;
