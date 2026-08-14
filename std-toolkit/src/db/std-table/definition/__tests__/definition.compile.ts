import { Schema } from 'effect';
import { EntityESchema } from '../../../../eschema/index.js';
import {
  Table,
  type KeyedEntityDefinition,
  type TableDefinition,
} from '../index.js';

const schema = EntityESchema.make('Person', 'id', {
  count: Schema.Number,
  encodedCount: Schema.NumberFromString,
  organizationId: Schema.String,
}).build();

const table = Table.make('people').primary('pk', 'sk').build();
const entity = table
  .entity(schema)
  .primary({ pk: ['organizationId', 'encodedCount'] })
  .build();

const exactTable: TableDefinition<'people'> = entity.table;
const exactEntity: KeyedEntityDefinition<
  'people',
  typeof schema,
  readonly ['organizationId', 'encodedCount'],
  readonly ['id'],
  {}
> = entity;

// @ts-expect-error exact logical Table identity is preserved
const wrongTable: TableDefinition<'orders'> = entity.table;

table.entity(schema).primary({
  // @ts-expect-error numbers that encode as numbers cannot be index components
  pk: ['count'],
});

export { exactEntity, exactTable, wrongTable };
