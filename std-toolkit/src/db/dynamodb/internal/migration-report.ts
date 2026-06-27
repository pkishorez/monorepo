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

const emptyDrift = () => ({
  dataDrift: 0,
  indexDrift: 0,
  primaryKeyChanged: 0,
});

const emptyEntity = (): MigrationEntityReport => ({
  ...emptyItems(),
  issues: emptyIssues(),
  drift: emptyDrift(),
});

const freezeReport = (snapshot: MigrationReport): MigrationReport => {
  Object.freeze(snapshot.items);
  Object.freeze(snapshot.issues);
  if (snapshot.progress) {
    Object.freeze(snapshot.progress);
  }
  for (const entity of Object.values(snapshot.entities)) {
    Object.freeze(entity.issues);
    Object.freeze(entity.drift);
    Object.freeze(entity);
  }
  for (const segment of Object.values(snapshot.segments)) {
    Object.freeze(segment);
  }
  for (const failure of snapshot.failures) {
    Object.freeze(failure);
  }
  Object.freeze(snapshot.entities);
  Object.freeze(snapshot.segments);
  Object.freeze(snapshot.failures);
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
    failures: [],
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
          if (inspection.state.data) {
            entityReport(entity).drift.dataDrift += 1;
          }
          if (inspection.state.indexes) {
            entityReport(entity).drift.indexDrift += 1;
          }
          addWarning(entity);
        }
        if (stateType === 'primaryKeyChanged') {
          report.items.migrate += 1;
          entityReport(entity).migrate += 1;
          entityReport(entity).drift.primaryKeyChanged += 1;
          addError(entity);
          report.failures.push({
            entity,
            ...(inspection.storedKey ? { key: inspection.storedKey } : {}),
            error: `Primary key changed${inspection.reasons.length > 0 ? ': ' + inspection.reasons.join('; ') : ''}`,
            timestamp: new Date().toISOString(),
          });
        }
        if (stateType === 'corrupt') {
          addError(entity);
          report.failures.push({
            entity,
            ...(inspection.storedKey ? { key: inspection.storedKey } : {}),
            error: `Corrupt item${inspection.reasons.length > 0 ? ': ' + inspection.reasons.join('; ') : ''}`,
            timestamp: new Date().toISOString(),
          });
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
        report.failures.push({
          ...(inspection.entity ? { entity: inspection.entity } : {}),
          error: `Invalid item${inspection.reason ? ': ' + inspection.reason : ''}`,
          timestamp: new Date().toISOString(),
        });
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
    recordSegmentFailed: (segment: string, error?: string) => {
      markRunning();
      segmentReport(segment).complete = false;
      report.items.failed += 1;
      addError();
      report.failures.push({
        error: error ?? `Segment ${segment} scan failed`,
        timestamp: new Date().toISOString(),
      });
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
    recordFailed: (
      detail: {
        entity?: string;
        key?: { pk: string; sk: string };
        error?: string;
      } = {},
    ) => {
      markRunning();
      report.items.failed += 1;
      if (detail.entity) {
        entityReport(detail.entity).failed += 1;
      }
      addError(detail.entity);
      report.failures.push({
        ...(detail.entity ? { entity: detail.entity } : {}),
        ...(detail.key ? { key: detail.key } : {}),
        error: detail.error ?? 'Unknown error',
        timestamp: new Date().toISOString(),
      });
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
              drift: { ...value.drift },
            },
          ]),
        ),
        segments: Object.fromEntries(
          Object.entries(report.segments).map(([segment, value]) => [
            segment,
            { ...value },
          ]),
        ),
        failures: [...report.failures],
      });
    },
  };
};
