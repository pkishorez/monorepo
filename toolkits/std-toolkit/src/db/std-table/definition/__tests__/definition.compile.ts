import { Schema } from 'effect';
import { EntityESchema, ESchema } from '../../../../eschema/index.js';
import { StdTable } from '../../table/index.js';
import type { KeyedEntityDefinition, TableDefinition } from '../index.js';

const schema = EntityESchema.make('Person', 'id', {
  count: Schema.Finite,
  organizationId: Schema.String,
}).build();

const people = StdTable.make('people')
  .primary('pk', 'sk')
  .entity(schema, (e) => e.primary({ pk: ['organizationId'] }))
  .build();
const entity = people.Person;

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

// @ts-expect-error an entity that was not declared is not on the table
void people.Other;

StdTable.make('people')
  .primary('pk', 'sk')
  .entity(schema, (e) => e.primary({ pk: ['count'] }));

const Settings = ESchema.make('Settings', { theme: Schema.String }).build();
const board = StdTable.make('board')
  .primary('pk', 'sk')
  .entity(schema, (e) => e.primary())
  .singleEntity(Settings, { default: { theme: 'light' } })
  .build();
board.Settings.put({ theme: 'dark' });
board.Person.get({ id: 'p1' });
// @ts-expect-error a single entity's default is its schema's value
StdTable.make('x').primary('pk', 'sk').singleEntity(Settings, { default: {} });

StdTable.make('twice')
  .primary('pk', 'sk')
  .entity(schema, (e) => e.primary())
  // @ts-expect-error an entity name is declared once per table
  .entity(schema, (e) => e.primary());

StdTable.make('topology-first')
  .primary('pk', 'sk')
  .entity(schema, (e) => e.primary())
  // @ts-expect-error indexes are declared before entities
  .gsi('GSI1', 'GSI1PK', 'GSI1SK');

const Scan = EntityESchema.make('scan', 'id', { value: Schema.String }).build();
StdTable.make('members')
  .primary('pk', 'sk')
  // @ts-expect-error an entity cannot take the name of a table member
  .entity(Scan, (e) => e.primary());

const Doc = EntityESchema.make('Doc', 'docId', {
  boardId: Schema.String,
  dueAt: Schema.DateFromString,
  owner: Schema.Union([
    Schema.Struct({ kind: Schema.Literal('user'), userId: Schema.String }),
    Schema.Struct({ kind: Schema.Literal('team'), teamId: Schema.String }),
  ]),
  tags: Schema.Array(Schema.String),
}).build();
const docs = StdTable.make('docs')
  .primary('pk', 'sk')
  .gsi('GSI1', 'GSI1PK', 'GSI1SK');

docs.entity(Doc, (e) => e.primary({ pk: ['boardId', 'owner.kind'] }));
docs.entity(Doc, (e) =>
  e.primary().index('GSI1', 'byUser', { pk: ['owner.userId'] }),
);
docs.entity(Doc, (e) =>
  e.primary({
    // @ts-expect-error a primary key path must exist in every union branch
    pk: ['owner.userId'],
  }),
);
docs.entity(Doc, (e) =>
  e.primary().index('GSI1', 'byDue', {
    // @ts-expect-error a converted Date is not a key part
    pk: ['dueAt'],
  }),
);
docs.entity(Doc, (e) =>
  e.primary().index('GSI1', 'byTag', {
    // @ts-expect-error key paths never enter arrays
    pk: ['tags'],
  }),
);

export { exactEntity, exactTable, wrongTable };
