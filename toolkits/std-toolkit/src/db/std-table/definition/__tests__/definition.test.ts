import { Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import {
  ESchema,
  EntityESchema,
  id,
  toSchema,
} from '../../../../eschema/index.js';
import { SnapshotIdentityConflict } from '../../../../snapshot/index.js';
import { Table } from '../index.js';

const addressSchema = EntityESchema.make('Address', 'addressId', {
  city: Schema.String,
}).build();

const personSchema = EntityESchema.make('Person', 'personId', {
  address: toSchema(addressSchema),
  createdAt: Schema.String,
  email: Schema.String,
  organizationId: Schema.String,
}).build();

const settingsSchema = ESchema.make('Settings', {
  theme: Schema.String,
}).build();

const makeTable = () =>
  Table.make('people')
    .primary('pk', 'sk')
    .lsi('LSI1', 'LSI1SK')
    .gsi('GSI1', 'GSI1PK', 'GSI1SK')
    .build();

describe('portable Table definition', () => {
  it('defines keyed and single entities against one logical topology', () => {
    const table = makeTable();
    const people = table
      .entity(personSchema)
      .primary({ pk: ['organizationId'] })
      .index('GSI1', 'byEmail', { pk: ['email'] })
      .index('LSI1', 'byCreatedAt', { sk: ['createdAt'] })
      .build();
    const settings = table
      .singleEntity(settingsSchema)
      .default({ theme: 'light' });

    expect(people.table).toBe(table);
    expect(settings.table).toBe(table);
    expect(people.accessPatterns).toEqual({
      byCreatedAt: {
        index: 'LSI1',
        kind: 'lsi',
        pk: ['organizationId'],
        sk: ['createdAt'],
      },
      byEmail: {
        index: 'GSI1',
        kind: 'gsi',
        pk: ['email'],
        sk: ['_u'],
      },
      primary: {
        kind: 'primary',
        pk: ['organizationId'],
        sk: ['personId'],
      },
    });
  });

  it('creates a deterministic adapter-independent snapshot', () => {
    const makeSnapshot = (reverse: boolean, theme: string) => {
      const table = makeTable();
      const keyed = () =>
        table
          .entity(personSchema)
          .primary({ pk: ['organizationId'] })
          .index('GSI1', 'byEmail', { pk: ['email'] })
          .index('LSI1', 'byCreatedAt', { sk: ['createdAt'] })
          .build();
      const single = () =>
        table.singleEntity(settingsSchema).default({ theme });
      if (reverse) {
        single();
        keyed();
      } else {
        keyed();
        single();
      }
      return table.snapshot();
    };

    const snapshot = makeSnapshot(false, 'light');
    expect(snapshot).toEqual(makeSnapshot(true, 'dark'));
    expect(snapshot).toMatchObject({
      _v: 'v2',
      kind: 'table',
      logicalName: 'people',
      topology: {
        primary: { pk: 'pk', sk: 'sk' },
        localSecondaryIndexes: [{ name: 'LSI1', pk: 'pk', sk: 'LSI1SK' }],
        globalSecondaryIndexes: [{ name: 'GSI1', pk: 'GSI1PK', sk: 'GSI1SK' }],
      },
      entities: [
        {
          name: 'Person',
          kind: 'keyed',
          schema: 'Person',
          idField: 'personId',
          primary: { pk: ['organizationId'], sk: ['personId'] },
          accessPatterns: [
            {
              name: 'byCreatedAt',
              index: 'LSI1',
              kind: 'lsi',
              pk: ['organizationId'],
              sk: ['createdAt'],
            },
            {
              name: 'byEmail',
              index: 'GSI1',
              kind: 'gsi',
              pk: ['email'],
              sk: ['_u'],
            },
            {
              name: 'primary',
              index: undefined,
              kind: 'primary',
              pk: ['organizationId'],
              sk: ['personId'],
            },
          ],
        },
        {
          name: 'Settings',
          kind: 'single',
          schema: 'Settings',
          idField: null,
          primary: { pk: [], sk: [] },
          accessPatterns: [],
        },
      ],
    });
    expect(snapshot.schemas.map(({ identity }) => identity)).toEqual([
      'Address',
      'Person',
      'Settings',
    ]);
    expect('adapter' in snapshot).toBe(false);
    expect(JSON.stringify(snapshot)).not.toContain('light');
  });

  it('rejects duplicate names without global mutable state', () => {
    const duplicateSlot = Table.make('one')
      .primary('pk', 'sk')
      .lsi('same', 'a');
    expect(() => duplicateSlot.gsi('same', 'b', 'c')).toThrow(
      'Index slot "same" is already defined',
    );

    const table = makeTable();
    table.entity(personSchema).primary().build();
    expect(() => table.entity(personSchema).primary().build()).toThrow(
      'Entity "Person" is already defined',
    );

    const duplicatePattern = makeTable()
      .entity(personSchema)
      .primary()
      .index('GSI1', 'same', { pk: ['email'] });
    expect(() =>
      duplicatePattern.index('LSI1', 'same', { sk: ['createdAt'] }),
    ).toThrow('Access pattern "same" is already defined');

    expect(() =>
      Table.assertUniqueNames([
        makeTable(),
        Table.make('people').primary('a', 'b').build(),
      ]),
    ).toThrow('Logical Table "people" is already defined');
    expect(Table.make('independent').logicalName).toBe('independent');
  });

  it('reserves portable storage attribute names', () => {
    expect(() => Table.make('people').primary('_e', 'sk')).toThrow(
      'Primary partition-key attribute "_e" is reserved for portable storage',
    );
    expect(() =>
      Table.make('people').primary('pk', 'sk').gsi('GSI1', 'data', 'GSI1SK'),
    ).toThrow(
      'Index partition-key attribute "data" is reserved for portable storage',
    );
    expect(() => Table.make('people').primary('key', 'key')).toThrow(
      'Primary partition-key and sort-key attributes must differ',
    );
    expect(() =>
      Table.make('people')
        .primary('pk', 'sk')
        .gsi('GSI1', 'GSI1Key', 'GSI1Key'),
    ).toThrow('Index "GSI1" partition-key and sort-key attributes must differ');
    expect(() =>
      Table.make('people').primary('pk', 'sk').gsi('_entity', 'gpk', 'gsk'),
    ).toThrow('Index slot name "_entity" is reserved');
  });

  it('rejects reused physical key attributes and Entity index slots', () => {
    expect(() =>
      Table.make('people').primary('pk', 'sk').gsi('GSI1', 'pk', 'GSI1SK'),
    ).toThrow('Index "GSI1" key attribute "pk" is already used');
    expect(() =>
      Table.make('people')
        .primary('pk', 'sk')
        .gsi('GSI1', 'GSI1PK', 'GSI1SK')
        .lsi('LSI1', 'GSI1SK'),
    ).toThrow('Index "LSI1" key attribute "GSI1SK" is already used');

    const entity = makeTable()
      .entity(personSchema)
      .primary()
      .index('GSI1', 'byEmail', { pk: ['email'] });
    expect(() =>
      entity.index('GSI1', 'byOrganization', { pk: ['organizationId'] }),
    ).toThrow('Index slot "GSI1" is already used by this Entity');
  });

  it('rejects non-string encoded index components at runtime', () => {
    const invalid = EntityESchema.make('Invalid', 'id', {
      count: Schema.Number,
    }).build();
    const table = makeTable();

    expect(() =>
      table
        .entity(invalid)
        .primary({ pk: ['count' as never] })
        .build(),
    ).toThrow('Index component "count" must encode to a string');
  });

  it('accepts nullable string index components', () => {
    const nullable = EntityESchema.make('Nullable', 'id', {
      label: Schema.NullOr(Schema.String),
    }).build();

    expect(() =>
      makeTable()
        .entity(nullable)
        .primary({ pk: ['label'] })
        .build(),
    ).not.toThrow();
  });

  it('accepts identifier-annotated string components behind $defs refs', () => {
    const annotated = EntityESchema.make('Annotated', 'id', {
      threadId: id('ThreadId'),
    }).build();

    expect(() =>
      makeTable()
        .entity(annotated)
        .primary({ pk: ['threadId'] })
        .build(),
    ).not.toThrow();
  });

  it('deduplicates shared schemas and rejects conflicting identities', () => {
    const shared = EntityESchema.make('Shared', 'id', {
      value: Schema.String,
    }).build();
    const left = EntityESchema.make('Left', 'id', {
      shared: toSchema(shared),
    }).build();
    const right = EntityESchema.make('Right', 'id', {
      shared: toSchema(shared),
    }).build();
    const table = makeTable();
    table.entity(left).primary().build();
    table.entity(right).primary().build();
    expect(
      table.snapshot().schemas.filter(({ identity }) => identity === 'Shared'),
    ).toHaveLength(1);

    const one = EntityESchema.make('Conflict', 'id', {
      value: Schema.String,
    }).build();
    const two = EntityESchema.make('Conflict', 'id', {
      value: Schema.Number,
    }).build();
    const conflictTable = makeTable();
    conflictTable
      .entity(
        EntityESchema.make('One', 'id', { nested: toSchema(one) }).build(),
      )
      .primary()
      .build();
    conflictTable
      .entity(
        EntityESchema.make('Two', 'id', { nested: toSchema(two) }).build(),
      )
      .primary()
      .build();
    expect(() => conflictTable.snapshot()).toThrow(SnapshotIdentityConflict);
  });
});
