import { Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { EntityESchema, ESchema } from '../../../../eschema/index.js';
import { TableSnapshot } from '../../../../snapshot/index.js';
import { StdTable } from '../../table/index.js';

const addressSchema = EntityESchema.make('Address', 'addressId', {
  city: Schema.String,
}).build();

const personSchema = EntityESchema.make('Person', 'personId', {
  address: addressSchema.schema,
  createdAt: Schema.String,
  email: Schema.String,
  organizationId: Schema.String,
}).build();

const settingsSchema = ESchema.make('Settings', {
  theme: Schema.String,
}).build();

const makeTable = () =>
  StdTable.make('people')
    .primary('pk', 'sk')
    .lsi('LSI1', 'LSI1SK')
    .gsi('GSI1', 'GSI1PK', 'GSI1SK');

describe('portable Table definition', () => {
  it('defines keyed and single entities against one logical topology', () => {
    const table = makeTable()
      .entity(personSchema, (e) =>
        e
          .primary({ pk: ['organizationId'] })
          .index('GSI1', 'byEmail', { pk: ['email'] })
          .index('LSI1', 'byCreatedAt', { sk: ['createdAt'] }),
      )
      .singleEntity(settingsSchema, { default: { theme: 'light' } })
      .build();
    const people = table.Person;
    const settings = table.Settings;

    expect(people.table).toBe(table);
    expect(settings.table).toBe(table);
    expect(table.registeredEntities.map(({ name }) => name)).toEqual([
      'Person',
      'Settings',
    ]);
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
      const table = reverse
        ? makeTable()
            .singleEntity(settingsSchema, { default: { theme } })
            .entity(personSchema, (e) =>
              e
                .primary({ pk: ['organizationId'] })
                .index('GSI1', 'byEmail', { pk: ['email'] })
                .index('LSI1', 'byCreatedAt', { sk: ['createdAt'] }),
            )
            .build()
        : makeTable()
            .entity(personSchema, (e) =>
              e
                .primary({ pk: ['organizationId'] })
                .index('GSI1', 'byEmail', { pk: ['email'] })
                .index('LSI1', 'byCreatedAt', { sk: ['createdAt'] }),
            )
            .singleEntity(settingsSchema, { default: { theme } })
            .build();
      return TableSnapshot.capture(table);
    };

    const snapshot = makeSnapshot(false, 'light');
    expect(snapshot).toEqual(makeSnapshot(true, 'dark'));
    expect(snapshot).toMatchObject({
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
    const duplicateSlot = StdTable.make('one')
      .primary('pk', 'sk')
      .lsi('same', 'a');
    expect(() => duplicateSlot.gsi('same', 'b', 'c')).toThrow(
      'Index slot "same" is already defined',
    );

    // The types refuse a second declaration, so it is cast past them here.
    const declared = makeTable().entity(personSchema, (e) =>
      e.primary(),
    ) as unknown as ReturnType<typeof makeTable>;
    expect(() => declared.entity(personSchema, (e) => e.primary())).toThrow(
      'Entity "Person" is already defined',
    );

    expect(() =>
      makeTable().entity(personSchema, (e) =>
        e
          .primary()
          .index('GSI1', 'same', { pk: ['email'] })
          .index('LSI1', 'same', { sk: ['createdAt'] }),
      ),
    ).toThrow('Access pattern "same" is already defined');

    expect(StdTable.make('independent').logicalName).toBe('independent');
  });

  it('refuses an entity named after a member of the table', () => {
    const scan = EntityESchema.make('scan', 'id', {
      value: Schema.String,
    }).build();
    // The types refuse this name, so it is cast past them here.
    const builder = makeTable() as unknown as {
      entity: (schema: unknown, configure: (e: never) => unknown) => unknown;
    };
    expect(() =>
      builder.entity(scan, (e: { primary: () => unknown }) => e.primary()),
    ).toThrow('Entity name "scan" is taken by the table\'s own "scan"');
  });

  it('reserves portable storage attribute names', () => {
    expect(() => StdTable.make('people').primary('_e', 'sk')).toThrow(
      'Primary partition-key attribute "_e" is reserved for portable storage',
    );
    expect(() =>
      StdTable.make('people').primary('pk', 'sk').gsi('GSI1', 'data', 'GSI1SK'),
    ).toThrow(
      'Index partition-key attribute "data" is reserved for portable storage',
    );
    expect(() => StdTable.make('people').primary('key', 'key')).toThrow(
      'Primary partition-key and sort-key attributes must differ',
    );
    expect(() =>
      StdTable.make('people')
        .primary('pk', 'sk')
        .gsi('GSI1', 'GSI1Key', 'GSI1Key'),
    ).toThrow('Index "GSI1" partition-key and sort-key attributes must differ');
    expect(() =>
      StdTable.make('people').primary('pk', 'sk').gsi('_entity', 'gpk', 'gsk'),
    ).toThrow('Index slot name "_entity" is reserved');
  });

  it('rejects reused physical key attributes and Entity index slots', () => {
    expect(() =>
      StdTable.make('people').primary('pk', 'sk').gsi('GSI1', 'pk', 'GSI1SK'),
    ).toThrow('Index "GSI1" key attribute "pk" is already used');
    expect(() =>
      StdTable.make('people')
        .primary('pk', 'sk')
        .gsi('GSI1', 'GSI1PK', 'GSI1SK')
        .lsi('LSI1', 'GSI1SK'),
    ).toThrow('Index "LSI1" key attribute "GSI1SK" is already used');

    expect(() =>
      makeTable().entity(personSchema, (e) =>
        e
          .primary()
          .index('GSI1', 'byEmail', { pk: ['email'] })
          .index('GSI1', 'byOrganization', { pk: ['organizationId'] }),
      ),
    ).toThrow('Index slot "GSI1" is already used by this Entity');
  });

  it('accepts string and number key paths, nested and through union branches', () => {
    const Doc = EntityESchema.make('Doc', 'docId', {
      boardId: Schema.String,
      rank: Schema.Finite,
      owner: Schema.Union([
        Schema.Struct({ kind: Schema.Literal('user'), userId: Schema.String }),
        Schema.Struct({
          kind: Schema.Literal('team'),
          teamId: Schema.String,
          seat: Schema.Finite,
        }),
      ]),
      assignee: Schema.NullOr(Schema.Struct({ id: Schema.String })),
    }).build();

    const doc = makeTable()
      .entity(Doc, (e) =>
        e
          .primary({ pk: ['boardId', 'owner.kind'] })
          .index('LSI1', 'byRank', { sk: ['rank'] })
          .index('GSI1', 'byTeam', {
            pk: ['owner.teamId'],
            sk: ['owner.seat'],
          }),
      )
      .build().Doc;
    expect(doc.accessPatterns.byTeam).toMatchObject({
      pk: ['owner.teamId'],
      sk: ['owner.seat'],
    });
    expect(() =>
      makeTable()
        .entity(Doc, (e) =>
          e.primary().index('GSI1', 'byAssignee', { pk: ['assignee.id'] }),
        )
        .build(),
    ).not.toThrow();
  });

  it('refuses a primary key path that is missing or null in some values', () => {
    const Doc = EntityESchema.make('Doc', 'docId', {
      owner: Schema.Union([
        Schema.Struct({ kind: Schema.Literal('user'), userId: Schema.String }),
        Schema.Struct({ kind: Schema.Literal('team'), teamId: Schema.String }),
      ]),
      label: Schema.NullOr(Schema.String),
    }).build();

    expect(() =>
      makeTable().entity(Doc, (e) =>
        e.primary({ pk: ['owner.userId' as never] }),
      ),
    ).toThrow(/"owner.userId" is missing or null in some values/);
    expect(() =>
      makeTable().entity(Doc, (e) => e.primary({ pk: ['label' as never] })),
    ).toThrow(/"label" is missing or null in some values/);
  });

  it('treats an optional nested property as missing in some values', () => {
    const Doc = EntityESchema.make('Doc', 'docId', {
      owner: Schema.Struct({ id: Schema.optionalKey(Schema.String) }),
    }).build();

    expect(() =>
      makeTable().entity(Doc, (e) => e.primary({ pk: ['owner.id' as never] })),
    ).toThrow(/"owner.id" is missing or null in some values/);
    expect(() =>
      makeTable()
        .entity(Doc, (e) =>
          e.primary().index('GSI1', 'byOwner', { pk: ['owner.id'] }),
        )
        .build(),
    ).not.toThrow();
  });

  it('refuses key paths that do not end at a string or number', () => {
    const Doc = EntityESchema.make('Doc', 'docId', {
      dueAt: Schema.DateFromString,
      tags: Schema.Array(Schema.Struct({ name: Schema.String })),
      scores: Schema.Record(Schema.String, Schema.String),
      done: Schema.Boolean,
      mixed: Schema.Union([Schema.String, Schema.Finite]),
    }).build();
    const index = (component: string) => () =>
      makeTable().entity(Doc, (e) =>
        e.primary().index('GSI1', 'byIt', { pk: [component as never] }),
      );

    expect(index('dueAt')).toThrow(/"dueAt" ends at a Declaration/);
    expect(index('tags.name')).toThrow(/"tags.name" passes through an array/);
    expect(index('scores.a')).toThrow(/"scores.a" passes through a record/);
    expect(index('done')).toThrow(/"done" ends at a Boolean/);
    expect(index('mixed')).toThrow(/"mixed" mixes strings and numbers/);
    expect(index('nothing')).toThrow(/"nothing" does not exist/);
  });

  it('accepts identifier-annotated string components behind $defs refs', () => {
    const annotated = EntityESchema.make('Annotated', 'id', {
      threadId: ESchema.id('ThreadId'),
    }).build();

    expect(() =>
      makeTable()
        .entity(annotated, (e) => e.primary({ pk: ['threadId'] }))
        .build(),
    ).not.toThrow();
  });

  it('deduplicates shared schemas and rejects conflicting identities', () => {
    const shared = EntityESchema.make('Shared', 'id', {
      value: Schema.String,
    }).build();
    const left = EntityESchema.make('Left', 'id', {
      shared: shared.schema,
    }).build();
    const right = EntityESchema.make('Right', 'id', {
      shared: shared.schema,
    }).build();
    const table = makeTable()
      .entity(left, (e) => e.primary())
      .entity(right, (e) => e.primary())
      .build();
    expect(
      TableSnapshot.capture(table).schemas.filter(
        ({ identity }) => identity === 'Shared',
      ),
    ).toHaveLength(1);

    const one = EntityESchema.make('Conflict', 'id', {
      value: Schema.String,
    }).build();
    const two = EntityESchema.make('Conflict', 'id', {
      value: Schema.Finite,
    }).build();
    const conflictTable = makeTable()
      .entity(
        EntityESchema.make('One', 'id', { nested: one.schema }).build(),
        (e) => e.primary(),
      )
      .entity(
        EntityESchema.make('Two', 'id', { nested: two.schema }).build(),
        (e) => e.primary(),
      )
      .build();
    expect(() => TableSnapshot.capture(conflictTable)).toThrow(
      'is claimed by different ESchemas',
    );
  });
});
