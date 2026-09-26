import { Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { StdTable } from 'std-toolkit/db';
import { ESchema, EntityESchema, toSchema } from 'std-toolkit/eschema';
import { TableSnapshot } from 'std-toolkit/snapshot';

import { QueryModel } from './query-model';

const table = StdTable.make('query-model-test')
  .primary('pk', 'sk')
  .lsi('LSI1', 'LSI1SK')
  .gsi('GSI1', 'GSI1PK', 'GSI1SK')
  .gsi('GSI2', 'GSI2PK', 'GSI2SK')
  .build();

const Owner = ESchema.make('Owner', {
  teamId: Schema.String,
  rank: Schema.Number,
}).build();

const account = table
  .entity(
    EntityESchema.make('Account', 'accountId', {
      organizationId: Schema.String,
      createdAt: Schema.String,
      email: Schema.String,
      owner: toSchema(Owner),
      board: Schema.NullOr(Schema.Struct({ id: Schema.String })),
      level: Schema.Literals([1, 2, 3]),
      active: Schema.Boolean,
      profile: Schema.Struct({ name: Schema.String }),
      contact: Schema.Union([
        Schema.Struct({ kind: Schema.Literal('email'), value: Schema.String }),
        Schema.Struct({ kind: Schema.Literal('phone'), value: Schema.String }),
      ]),
    }).build(),
  )
  .primary({ pk: ['organizationId'] })
  .index('LSI1', 'byCreatedAt', { sk: ['createdAt'] })
  .index('GSI1', 'byEmail', { pk: ['email'], sk: ['createdAt'] })
  .index('GSI2', 'byOwner', {
    pk: ['owner.teamId', 'board.id'],
    sk: ['owner.rank', 'level'],
  })
  .build();

const snapshot = TableSnapshot.capture(table);
const entity = snapshot.entities.find(({ name }) => name === account.name)!;

describe('Studio query model', () => {
  it('derives stable top-level columns from the latest encoded schema', () => {
    expect(QueryModel.valueFields(snapshot, entity)).toEqual([
      'accountId',
      'active',
      'board',
      'contact',
      'createdAt',
      'email',
      'level',
      'organizationId',
      'owner',
      'profile',
    ]);
  });

  it('requires every partition component and omits sort criteria for a full item collection', () => {
    const primary = entity.accessPatterns.find(
      ({ name }) => name === 'primary',
    )!;
    const initial = QueryModel.initialCriteria(snapshot, entity, primary, 25);
    expect(QueryModel.canRun(initial)).toBe(false);

    const criteria = {
      ...initial,
      pk: QueryModel.updateValue(initial.pk, 'organizationId', 'acme'),
    };
    expect(QueryModel.canRun(criteria)).toBe(true);
    expect(QueryModel.payload(criteria)).toEqual({
      entity: 'Account',
      accessPattern: 'primary',
      pk: { organizationId: 'acme' },
      limit: 25,
    });
  });

  it('builds composite between and unbounded ordered conditions', () => {
    const pattern = entity.accessPatterns.find(
      ({ name }) => name === 'byCreatedAt',
    )!;
    const initial = QueryModel.initialCriteria(snapshot, entity, pattern, 50);
    const base = {
      ...initial,
      pk: { organizationId: 'acme' },
    };
    const between = {
      ...base,
      operator: 'between' as const,
      sk: { createdAt: '2026-01-01' },
      skEnd: { createdAt: '2026-12-31' },
    };
    expect(QueryModel.payload(between)?.sk).toEqual({
      operator: 'between',
      value: [{ createdAt: '2026-01-01' }, { createdAt: '2026-12-31' }],
    });

    expect(
      QueryModel.payload({
        ...base,
        operator: '<' as const,
        unbounded: true,
      })?.sk,
    ).toEqual({ operator: '<', value: null });
  });

  it('types key paths through nested ESchemas, nullable structs and literals', () => {
    const pattern = entity.accessPatterns.find(
      ({ name }) => name === 'byOwner',
    )!;
    const initial = QueryModel.initialCriteria(snapshot, entity, pattern);
    expect(initial.kinds).toEqual({
      'owner.teamId': 'string',
      'board.id': 'string',
      'owner.rank': 'number',
      level: 'number',
    });

    const criteria = {
      ...initial,
      pk: { 'owner.teamId': 'team-1', 'board.id': 'board-1' },
      operator: '>=' as const,
      sk: { 'owner.rank': '2.5', level: '1' },
    };
    expect(QueryModel.payload(criteria)).toEqual({
      entity: 'Account',
      accessPattern: 'byOwner',
      pk: { 'owner.teamId': 'team-1', 'board.id': 'board-1' },
      sk: { operator: '>=', value: { 'owner.rank': 2.5, level: 1 } },
      limit: 25,
    });
  });

  it('blocks a query whose number component does not parse', () => {
    const pattern = entity.accessPatterns.find(
      ({ name }) => name === 'byOwner',
    )!;
    const criteria = {
      ...QueryModel.initialCriteria(snapshot, entity, pattern),
      pk: { 'owner.teamId': 'team-1', 'board.id': 'board-1' },
      operator: '=' as const,
      sk: { 'owner.rank': 'high', level: '1' },
    };
    expect(QueryModel.keyIssue('number', 'high')).toBe('Must be a number');
    expect(QueryModel.keyIssue('string', 'high')).toBeUndefined();
    expect(QueryModel.canRun(criteria)).toBe(false);
    expect(QueryModel.payload(criteria)).toBeUndefined();
  });

  it('labels semantic access patterns with their physical index slot', () => {
    expect(
      entity.accessPatterns.map((pattern) => QueryModel.patternLabel(pattern)),
    ).toEqual([
      'byCreatedAt · LSI1',
      'byEmail · GSI1',
      'byOwner · GSI2',
      'primary · Primary',
    ]);
  });
});
