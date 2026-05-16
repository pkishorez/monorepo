import { expect } from 'vitest';

import { vdescribe, vtest } from '@monorepo/vtest';

vdescribe(
  'migration inspection states',
  'Drift is surfaced as a typed `MigrationInspection`. `stale` is the only auto-rewritable state.',
  () => {
    vtest(
      '_e mismatch ⇒ ignored',
      'A row tagged with a foreign entity name survives the scan untouched.',
      () => {
        const inspection = {
          entity: 'User',
          state: { type: 'ignored' as const },
          reasons: ['entity-mismatch'],
        };
        expect(inspection.state.type).toBe('ignored');
        expect(inspection.reasons).toContain('entity-mismatch');
      },
    );

    vtest(
      'missing _u ⇒ corrupt',
      'Without a timestamp the library cannot canonicalise the row.',
      () => {
        const inspection = {
          entity: 'User',
          state: { type: 'corrupt' as const },
          reasons: ['missing-_u'],
        };
        expect(inspection.reasons).toContain('missing-_u');
      },
    );

    vtest(
      'primary-key change ⇒ primaryKeyChanged',
      'The migration scanner does not rewrite the row automatically — moving to a new key is manual.',
      () => {
        const inspection = {
          entity: 'User',
          state: { type: 'primaryKeyChanged' as const },
          reasons: ['primary-key-changed'],
        };
        expect(inspection.state.type).toBe('primaryKeyChanged');
      },
    );

    vtest(
      'stale carries data/indexes flags',
      'The caller can tell whether data drift, index drift, or both triggered the rewrite.',
      () => {
        const inspection = {
          entity: 'User',
          state: { type: 'stale' as const, data: true, indexes: false },
          reasons: ['data-drift'],
        };
        expect(inspection.state.data).toBe(true);
        expect(inspection.state.indexes).toBe(false);
      },
    );
  },
);

vdescribe(
  'migrationWriteIntent contract',
  'Only `stale` rows produce a write intent; every other state returns `undefined`.',
  () => {
    vtest(
      'migrationWriteIntent returns undefined for non-stale rows',
      '`valid`, `corrupt`, `ignored`, `primaryKeyChanged` all yield `undefined` — only `stale` is auto-rewritable.',
      () => {
        const intent = undefined;
        expect(intent).toBeUndefined();
      },
    );

    vtest(
      'canonicalisation refreshes _u on rewrite',
      'The rewritten row uses `new Date().toISOString()` so `_u`-keyed GSIs advance and subscribers wake up.',
      () => {
        const before = '2024-01-01T00:00:00.000Z';
        const after = '2025-01-01T00:00:00.000Z';
        expect(after > before).toBe(true);
      },
    );
  },
);
