import { describe, expect, it } from 'vitest';
import { TableSnapshot } from '../index.js';

describe('change rendering', () => {
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

  it('renders snapshot types in an edit', () => {
    const rendered = TableSnapshot.renderChanges([
      {
        subject: { kind: 'version', name: 'User', version: 'v1' },
        action: 'edited',
        impact: 'breaking',
        edits: [
          {
            path: ['name'],
            before: { type: 'string' },
            after: {
              type: 'union',
              members: [{ type: 'string' }, { type: 'null' }],
            },
          },
        ],
      },
    ]);

    expect(rendered).toContain('name: string → string | null');
  });
});
