import { Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { ESchema, toSchema } from '../../eschema/index.js';
import { Snapshot, type TableSnapshot } from '../index.js';

describe('snapshot rendering', () => {
  it('renders nested domain contracts deterministically', () => {
    const child = ESchema.make('Child', { value: Schema.String }).build();
    const snapshot = ESchema.make('Parent', {
      child: toSchema(child),
    })
      .build()
      .snapshot();
    const rendered = Snapshot.render(snapshot);

    expect(rendered).toContain('DATABASE CONTRACT');
    expect(rendered).toContain('ESchema root: Parent');
    expect(rendered).toContain('Child · struct');
    expect(rendered).toContain('child: Child');
    expect(rendered).toContain('encoded');
    expect(rendered).toContain('decoded');
    expect(Snapshot.render(structuredClone(snapshot))).toBe(rendered);
  });

  it('renders ordered changes for review', () => {
    const rendered = Snapshot.renderChanges([
      {
        path: '/secondaryIndexes/GSI2',
        scope: 'index',
        kind: 'secondary-index-added',
        classification: 'requires-backfill',
        message: 'Added secondary index GSI2',
        after: {
          name: 'GSI2',
          kind: 'gsi',
          pk: 'gsi2pk',
          sk: 'gsi2sk',
        },
      },
      {
        path: '/schemas/User/versions/v2',
        scope: 'eschema',
        kind: 'version-added',
        classification: 'safe',
        message: 'Added next version User v2',
      },
    ]);

    expect(rendered).toContain('✓ SAFE');
    expect(rendered).toContain('◇ BACKFILL');
    expect(rendered).toContain('/schemas/User/versions/v2');
    expect(rendered).toContain('Partition key');
    expect(rendered).toContain('gsi2pk');
  });

  it('dispatches ESchema and table rendering without recursion', () => {
    const eschema = ESchema.make('Item', { value: Schema.String })
      .build()
      .snapshot();
    const table: TableSnapshot = {
      _v: 'v1',
      kind: 'table',
      adapter: 'dynamodb',
      primaryIndex: { pk: 'pk', sk: 'sk' },
      secondaryIndexes: [],
      entities: [],
      schemas: eschema.schemas,
    };

    expect(Snapshot.render(eschema)).toContain('ESchema root: Item');
    expect(Snapshot.render(table)).toContain('Table: dynamodb');
    expect(Snapshot.render(table)).toContain('SCHEMAS');
  });
});
