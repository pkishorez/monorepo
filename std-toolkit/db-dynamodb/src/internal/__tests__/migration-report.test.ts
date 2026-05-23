import { describe, expect, it } from 'vitest';

import { createMigrationReportAccumulator } from '../index.js';

const emptyDrift = () => ({
  dataDrift: 0,
  indexDrift: 0,
  primaryKeyChanged: 0,
});

describe('migration report accumulator', () => {
  it('starts with an initial empty migration report', () => {
    const accumulator = createMigrationReportAccumulator();

    expect(accumulator.snapshot()).toEqual({
      phase: 'initial',
      items: {
        scanned: 0,
        ignored: 0,
        migrate: 0,
        migrated: 0,
        failed: 0,
      },
      issues: {
        warnings: 0,
        errors: 0,
      },
      entities: {},
      segments: {},
      failures: [],
    });
  });

  it('records scanned items by item, entity, and segment', () => {
    const accumulator = createMigrationReportAccumulator();

    accumulator.recordScanned({
      entity: 'User',
      segment: '0',
      count: 2,
    });

    expect(accumulator.snapshot()).toEqual({
      phase: 'running',
      items: {
        scanned: 2,
        ignored: 0,
        migrate: 0,
        migrated: 0,
        failed: 0,
      },
      issues: {
        warnings: 0,
        errors: 0,
      },
      entities: {
        User: {
          scanned: 2,
          ignored: 0,
          migrate: 0,
          migrated: 0,
          failed: 0,
          issues: {
            warnings: 0,
            errors: 0,
          },
          drift: emptyDrift(),
        },
      },
      segments: {
        '0': {
          scanned: 2,
          complete: false,
        },
      },
      failures: [],
    });
  });

  it('records ignored items and inspection issues by entity', () => {
    const accumulator = createMigrationReportAccumulator();

    accumulator.recordIgnored({ entity: 'User' });
    accumulator.recordInspection({ state: 'invalid', entity: 'User' });
    accumulator.recordInspection({ state: 'ignored' });

    expect(accumulator.snapshot()).toMatchObject({
      phase: 'running',
      items: {
        ignored: 2,
      },
      issues: {
        warnings: 1,
        errors: 1,
      },
      entities: {
        User: {
          ignored: 1,
          issues: {
            warnings: 0,
            errors: 1,
          },
        },
      },
    });
  });

  it('records migration candidates separately from real migrated rows', () => {
    const dryRun = createMigrationReportAccumulator({ dryRun: true });
    const realRun = createMigrationReportAccumulator();

    dryRun.recordInspection({ state: 'migrate', entity: 'User' });
    dryRun.recordMigrated({ entity: 'User' });
    realRun.recordInspection({ state: 'migrate', entity: 'User' });
    realRun.recordMigrated({ entity: 'User' });

    expect(dryRun.snapshot().items).toMatchObject({
      migrate: 1,
      migrated: 0,
    });
    expect(dryRun.snapshot().entities.User).toMatchObject({
      migrate: 1,
      migrated: 0,
    });
    expect(realRun.snapshot().items).toMatchObject({
      migrate: 1,
      migrated: 1,
    });
    expect(realRun.snapshot().entities.User).toMatchObject({
      migrate: 1,
      migrated: 1,
    });
  });

  it('records segment completion and progress estimates', () => {
    const accumulator = createMigrationReportAccumulator({
      progress: { estimatedTotal: 10 },
    });

    accumulator.recordScanned({ segment: '1', count: 4 });
    accumulator.completeSegment('1');

    expect(accumulator.snapshot()).toMatchObject({
      phase: 'running',
      progress: {
        scanned: 4,
        total: 10,
        percent: 40,
      },
      segments: {
        '1': {
          scanned: 4,
          complete: true,
        },
      },
    });
  });

  it('records failed rows and completes with failures when any row failed', () => {
    const successful = createMigrationReportAccumulator();
    const failed = createMigrationReportAccumulator();

    successful.recordMigrated({ entity: 'User' });
    successful.complete();

    failed.recordFailed({ entity: 'User' });
    failed.complete();

    expect(successful.snapshot().phase).toBe('completed');
    expect(failed.snapshot()).toMatchObject({
      phase: 'completed-with-failures',
      items: {
        failed: 1,
      },
      issues: {
        errors: 1,
      },
      entities: {
        User: {
          failed: 1,
          issues: {
            errors: 1,
          },
        },
      },
    });
  });

  it('returns immutable snapshots that do not expose accumulator state', () => {
    const accumulator = createMigrationReportAccumulator();

    accumulator.recordScanned({ entity: 'User', segment: '0' });
    const snapshot = accumulator.snapshot();

    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.items)).toBe(true);
    expect(Object.isFrozen(snapshot.entities.User)).toBe(true);
    expect(Object.isFrozen(snapshot.segments['0'])).toBe(true);
  });
});
