import { Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { ESchema, toSchema } from '../../eschema/index.js';
import { Snapshot, type TableSnapshot } from '../index.js';

describe('snapshot rendering', () => {
  it('renders nested domain contracts deterministically', () => {
    const child = ESchema.make('Child', { value: Schema.String }).build();
    const snapshot = Snapshot.capture(
      ESchema.make('Parent', { child: toSchema(child) }).build(),
    );
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
        subject: { kind: 'global-secondary-index', name: 'GSI2' },
        action: 'added',
        impact: 'requires-backfill',
        edits: [],
      },
      {
        subject: { kind: 'version', name: 'User', version: 'v2' },
        action: 'added',
        impact: 'safe',
        edits: [],
      },
    ]);

    expect(rendered).toContain('SAFE');
    expect(rendered).toContain('BACKFILL');
    expect(rendered).toContain('User v2 added');
    expect(rendered).toContain('Global secondary index GSI2 added');
  });

  it('dispatches ESchema and table rendering without recursion', () => {
    const eschema = Snapshot.capture(
      ESchema.make('Item', { value: Schema.String }).build(),
    );
    const table: TableSnapshot = {
      _v: 'v2',
      kind: 'table',
      logicalName: 'app',
      topology: {
        primary: { pk: 'pk', sk: 'sk' },
        localSecondaryIndexes: [],
        globalSecondaryIndexes: [],
      },
      entities: [],
      schemas: eschema.schemas,
    };

    expect(Snapshot.render(eschema)).toContain('ESchema root: Item');
    expect(Snapshot.render(table)).toContain('Table: app');
    expect(Snapshot.render(table)).toContain('SCHEMAS');
  });
});
