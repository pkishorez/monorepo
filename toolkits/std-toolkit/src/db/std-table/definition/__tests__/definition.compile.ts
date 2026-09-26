import { Schema } from 'effect';
import { EntityESchema } from '../../../../eschema/index.js';
import {
  Table,
  type KeyedEntityDefinition,
  type TableDefinition,
} from '../index.js';

const schema = EntityESchema.make('Person', 'id', {
  count: Schema.Number,
  organizationId: Schema.String,
}).build();

const table = Table.make('people').primary('pk', 'sk').build();
const entity = table
  .entity(schema)
  .primary({ pk: ['organizationId'] })
  .build();

const exactTable: TableDefinition<'people'> = entity.table;
const exactEntity: KeyedEntityDefinition<
  'people',
  typeof schema,
  readonly ['organizationId'],
  readonly ['id'],
  {}
> = entity;

// @ts-expect-error exact logical Table identity is preserved
const wrongTable: TableDefinition<'orders'> = entity.table;

table.entity(schema).primary({ pk: ['count'] });

const Doc = EntityESchema.make('Doc', 'docId', {
  boardId: Schema.String,
  dueAt: Schema.DateFromString,
  owner: Schema.Union([
    Schema.Struct({ kind: Schema.Literal('user'), userId: Schema.String }),
    Schema.Struct({ kind: Schema.Literal('team'), teamId: Schema.String }),
  ]),
  tags: Schema.Array(Schema.String),
}).build();
const docs = Table.make('docs')
  .primary('pk', 'sk')
  .gsi('GSI1', 'GSI1PK', 'GSI1SK')
  .build();

docs.entity(Doc).primary({ pk: ['boardId', 'owner.kind'] });
docs
  .entity(Doc)
  .primary()
  .index('GSI1', 'byUser', { pk: ['owner.userId'] });
docs.entity(Doc).primary({
  // @ts-expect-error a primary key path must exist in every union branch
  pk: ['owner.userId'],
});
docs
  .entity(Doc)
  .primary()
  .index('GSI1', 'byDue', {
    // @ts-expect-error a converted Date is not a key part
    pk: ['dueAt'],
  });
docs
  .entity(Doc)
  .primary()
  .index('GSI1', 'byTag', {
    // @ts-expect-error key paths never enter arrays
    pk: ['tags'],
  });

export { exactEntity, exactTable, wrongTable };
