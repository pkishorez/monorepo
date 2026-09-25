import { Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { ESchema, toSchema } from '../../eschema/index.js';
import { TableSnapshot } from '../index.js';
import { snapshotOf } from './helpers.js';

describe('snapshot rendering', () => {
  it('renders nested domain contracts deterministically', () => {
    const child = ESchema.make('Child', { value: Schema.String }).build();
    const snapshot = snapshotOf(
      ESchema.make('Parent', { child: toSchema(child) }).build(),
    );
    const rendered = TableSnapshot.render(snapshot);

    expect(rendered).toContain('DATABASE CONTRACT');
    expect(rendered).toContain('Table: app');
    expect(rendered).toContain('SCHEMAS');
    expect(rendered).toContain('Child · struct');
    expect(rendered).toContain('child: Child');
    expect(rendered).toContain('encoded');
    expect(rendered).toContain('decoded');
    expect(TableSnapshot.render(structuredClone(snapshot))).toBe(rendered);
  });

  it('renders ordered changes for review', () => {
    const rendered = TableSnapshot.renderChanges([
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
});
