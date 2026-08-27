import { Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { StdTable } from 'std-toolkit/db';
import { EntityESchema } from 'std-toolkit/eschema';

import { QueryModel } from './query-model';

const table = StdTable.make('query-model-test')
  .primary('pk', 'sk')
  .lsi('LSI1', 'LSI1SK')
  .gsi('GSI1', 'GSI1PK', 'GSI1SK')
  .build();

const account = table
  .entity(
    EntityESchema.make('Account', 'accountId', {
      organizationId: Schema.String,
      createdAt: Schema.String,
      email: Schema.String,
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
  .build();

const snapshot = table.snapshot();
const entity = snapshot.entities.find(({ name }) => name === account.name)!;

describe('Studio query model', () => {
  it('derives stable top-level columns from the latest encoded schema', () => {
    expect(QueryModel.valueFields(snapshot, entity)).toEqual([
      'accountId',
      'active',
      'contact',
      'createdAt',
      'email',
      'organizationId',
      'profile',
    ]);
  });

  it('requires every partition component and omits sort criteria for a full item collection', () => {
    const primary = entity.accessPatterns.find(
      ({ name }) => name === 'primary',
    )!;
    const initial = QueryModel.initialCriteria(entity, primary, 25);
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
    const initial = QueryModel.initialCriteria(entity, pattern, 50);
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

  it('labels semantic access patterns with their physical index slot', () => {
    expect(
      entity.accessPatterns.map((pattern) => QueryModel.patternLabel(pattern)),
    ).toEqual(['byCreatedAt · LSI1', 'byEmail · GSI1', 'primary · Primary']);
  });
});
