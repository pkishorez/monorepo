import type {
  MigrationEntityReport,
  MigrationInspection,
  MigrationOptions,
  MigrationReport,
} from '../types/migration.js';

type ProgressEstimate = {
  total: number;
  approximate: boolean;
};

const emptyItems = () => ({
  scanned: 0,
  ignored: 0,
  migrate: 0,
  migrated: 0,
  failed: 0,
});

const emptyIssues = () => ({
  warnings: 0,
  errors: 0,
});

const emptyEntity = (): MigrationEntityReport => ({
  ...emptyItems(),
  issues: emptyIssues(),
});

const freezeReport = (snapshot: MigrationReport): MigrationReport => {
  Object.freeze(snapshot.items);
  Object.freeze(snapshot.issues);
  if (snapshot.progress) {
    Object.freeze(snapshot.progress);
  }
  for (const entity of Object.values(snapshot.entities)) {
    Object.freeze(entity.issues);
    Object.freeze(entity);
  }
  for (const segment of Object.values(snapshot.segments)) {
    Object.freeze(segment);
  }
  Object.freeze(snapshot.entities);
  Object.freeze(snapshot.segments);
  return Object.freeze(snapshot);
};

export const createMigrationReportAccumulator = (
  options: MigrationOptions = {},
  progressEstimate?: ProgressEstimate,
) => {
  const report: MigrationReport = {
    phase: 'initial',
    items: emptyItems(),
    issues: emptyIssues(),
    entities: {},
    segments: {},
  };

  const markRunning = () => {
    if (report.phase === 'initial') {
      report.phase = 'running';
    }
  };

  const entityReport = (entity: string) => {
    report.entities[entity] ??= emptyEntity();
    return report.entities[entity];
  };

  const segmentReport = (segment: string) => {
    report.segments[segment] ??= {
      scanned: 0,
      complete: false,
    };
    return report.segments[segment];
  };

  const addWarning = (entity?: string) => {
    report.issues.warnings += 1;
    if (entity) {
      entityReport(entity).issues.warnings += 1;
    }
  };

  const addError = (entity?: string) => {
    report.issues.errors += 1;
    if (entity) {
      entityReport(entity).issues.errors += 1;
    }
  };

  return {
    recordIgnored: ({ entity }: { entity?: string } = {}) => {
      markRunning();
      report.items.ignored += 1;
      if (entity) {
        entityReport(entity).ignored += 1;
      }
    },
    recordInspection: (inspection: MigrationInspection) => {
      markRunning();
      if (typeof inspection.state === 'object') {
        const entity = inspection.entity;
        const stateType = inspection.state.type;

        if (stateType === 'stale') {
          report.items.migrate += 1;
          entityReport(entity).migrate += 1;
          addWarning(entity);
        }
        if (stateType === 'primaryKeyChanged') {
          report.items.migrate += 1;
          entityReport(entity).migrate += 1;
          addError(entity);
        }
        if (stateType === 'corrupt') {
          addError(entity);
        }
        if (stateType === 'ignored') {
          report.items.ignored += 1;
          entityReport(entity).ignored += 1;
        }
        return;
      }

      if (inspection.state === 'migrate') {
        report.items.migrate += 1;
        entityReport(inspection.entity).migrate += 1;
      }
      if (inspection.state === 'ignored') {
        report.items.ignored += 1;
        if (inspection.entity) {
          entityReport(inspection.entity).ignored += 1;
        }
        addWarning(inspection.entity);
      }
      if (inspection.state === 'invalid') {
        addError(inspection.entity);
      }
    },
    recordScanned: ({
      entity,
      segment,
      count = 1,
    }: {
      entity?: string;
      segment?: string;
      count?: number;
    }) => {
      markRunning();
      report.items.scanned += count;
      if (entity) {
        entityReport(entity).scanned += count;
      }
      if (segment) {
        segmentReport(segment).scanned += count;
      }
    },
    completeSegment: (segment: string) => {
      markRunning();
      segmentReport(segment).complete = true;
    },
    recordSegmentFailed: (segment: string) => {
      markRunning();
      segmentReport(segment).complete = false;
      report.items.failed += 1;
      addError();
    },
    recordMigrated: ({ entity }: { entity?: string } = {}) => {
      markRunning();
      if (options.dryRun) {
        return;
      }

      report.items.migrated += 1;
      if (entity) {
        entityReport(entity).migrated += 1;
      }
    },
    recordFailed: ({ entity }: { entity?: string } = {}) => {
      markRunning();
      report.items.failed += 1;
      if (entity) {
        entityReport(entity).failed += 1;
      }
      addError(entity);
    },
    complete: () => {
      report.phase =
        report.items.failed > 0 ? 'completed-with-failures' : 'completed';
    },
    snapshot: (): MigrationReport => {
      const resolvedProgressEstimate =
        progressEstimate ??
        (typeof options.progress?.estimatedTotal === 'number'
          ? { total: options.progress.estimatedTotal, approximate: false }
          : undefined);
      const estimatedTotal = resolvedProgressEstimate?.total;
      const progress =
        estimatedTotal && estimatedTotal > 0
          ? {
              scanned: report.items.scanned,
              total: estimatedTotal,
              percent: Math.min(
                100,
                Math.round((report.items.scanned / estimatedTotal) * 100),
              ),
              ...(resolvedProgressEstimate?.approximate
                ? { approximate: true }
                : {}),
            }
          : undefined;

      return freezeReport({
        ...report,
        ...(progress ? { progress } : {}),
        items: { ...report.items },
        issues: { ...report.issues },
        entities: Object.fromEntries(
          Object.entries(report.entities).map(([entity, value]) => [
            entity,
            {
              ...value,
              issues: { ...value.issues },
            },
          ]),
        ),
        segments: Object.fromEntries(
          Object.entries(report.segments).map(([segment, value]) => [
            segment,
            { ...value },
          ]),
        ),
      });
    },
  };
};
