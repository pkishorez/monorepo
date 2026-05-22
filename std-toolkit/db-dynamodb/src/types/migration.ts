export type MigrationState =
  | 'initial'
  | 'running'
  | 'completed'
  | 'completed-with-failures';

export type MigrationInspectionState =
  | { type: 'valid' }
  | {
      type: 'stale';
      data: boolean;
      indexes: boolean;
    }
  | { type: 'corrupt' }
  | { type: 'primaryKeyChanged' }
  | { type: 'ignored' };

type EntityMigrationInspection = {
  entity: string;
  state: MigrationInspectionState;
  storedKey?: {
    pk: string;
    sk: string;
  };
  canonicalKey?: {
    pk: string;
    sk: string;
  };
  reasons: string[];
};

type LegacyMigrationInspection =
  | {
      state: 'current';
      entity: string;
    }
  | {
      state: 'migrate';
      entity: string;
    }
  | {
      state: 'ignored';
      entity?: string;
      reason?: string;
    }
  | {
      state: 'invalid';
      entity?: string;
      reason?: string;
    };

export type MigrationInspection =
  | EntityMigrationInspection
  | LegacyMigrationInspection;

export type MigrationItemReport = {
  scanned: number;
  ignored: number;
  migrate: number;
  migrated: number;
  failed: number;
};

export type MigrationIssueReport = {
  warnings: number;
  errors: number;
};

export type MigrationDriftReport = {
  dataDrift: number;
  indexDrift: number;
  primaryKeyChanged: number;
};

export type MigrationEntityReport = MigrationItemReport & {
  issues: MigrationIssueReport;
  drift: MigrationDriftReport;
};

export type MigrationSegmentReport = {
  scanned: number;
  complete: boolean;
};

export type MigrationProgressEstimate = {
  scanned: number;
  total: number;
  percent: number;
  approximate?: boolean;
};

export type MigrationFailure = {
  entity?: string;
  key?: { pk: string; sk: string };
  error: string;
  timestamp: string;
};

export type MigrationReport = {
  phase: MigrationState;
  progress?: MigrationProgressEstimate;
  items: MigrationItemReport;
  issues: MigrationIssueReport;
  entities: Record<string, MigrationEntityReport>;
  segments: Record<string, MigrationSegmentReport>;
  failures: MigrationFailure[];
};

export type MigrationOptions = {
  dryRun?: boolean;
  batchSize?: number;
  entities?: readonly string[];
  scan?: {
    pageLimit?: number;
    totalSegments?: number;
    consistentRead?: boolean;
  };
  concurrency?: {
    itemsPerSegment?: number;
  };
  progress?: {
    estimatedTotal?: number | false;
  };
};
