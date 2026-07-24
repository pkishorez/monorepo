export type SnapshotClassification =
  | 'safe'
  | 'requires-backfill'
  | 'breaking'
  | 'unverifiable';

export type SnapshotScope =
  | 'snapshot'
  | 'eschema'
  | 'table'
  | 'entity'
  | 'index';

export interface SnapshotMarker {
  readonly path: string;
  readonly kind: string;
  readonly message: string;
}

export interface SnapshotTransformation {
  readonly path: string;
  readonly name: string;
}

export interface ESchemaVersion {
  readonly version: string;
  readonly encoded: unknown;
  readonly decoded: unknown;
  readonly transformations: readonly SnapshotTransformation[];
  readonly unverifiable: readonly SnapshotMarker[];
}

export interface ESchemaDefinition {
  readonly identity: string;
  readonly kind: 'struct' | 'value' | 'entity' | 'single-entity';
  readonly idField: string | null;
  readonly versions: readonly ESchemaVersion[];
}

export interface ESchemaSnapshot {
  readonly _v: 'v1';
  readonly kind: 'eschema';
  readonly root: string;
  readonly schemas: readonly ESchemaDefinition[];
}

export interface TableSnapshot {
  readonly _v: 'v1';
  readonly kind: 'table';
  readonly adapter: 'dynamodb' | 'sqlite' | 'idb';
  readonly primaryIndex: {
    readonly pk: string;
    readonly sk: string;
  };
  readonly secondaryIndexes: readonly TableIndexSnapshot[];
  readonly entities: readonly TableEntitySnapshot[];
  readonly schemas: readonly ESchemaDefinition[];
}

export interface TableIndexSnapshot {
  readonly name: string;
  readonly kind: 'gsi' | 'lsi' | 'secondary' | 'sparse';
  readonly pk: string;
  readonly sk: string;
}

export interface TableEntityDerivationSnapshot {
  readonly pk: readonly string[];
  readonly sk: readonly string[];
}

export interface TableEntitySecondaryDerivationSnapshot extends TableEntityDerivationSnapshot {
  readonly name: string;
  readonly physicalIndex: string;
}

export interface TableEntitySnapshot {
  readonly name: string;
  readonly kind: 'keyed' | 'singleton';
  readonly idField: string | null;
  readonly schema: string;
  readonly primaryDerivation: TableEntityDerivationSnapshot;
  readonly secondaryDerivations: readonly TableEntitySecondaryDerivationSnapshot[];
}

export interface TableEntitySnapshotSource extends TableEntitySnapshot {
  readonly eschema: object;
}

export type ContractSnapshot = ESchemaSnapshot | TableSnapshot;

export interface SnapshotDiagnostic {
  readonly path: string;
  readonly kind: string;
  readonly message: string;
}

export interface SnapshotChange {
  readonly path: string;
  readonly scope: SnapshotScope;
  readonly kind: string;
  readonly classification: SnapshotClassification;
  readonly message: string;
  readonly before?: unknown;
  readonly after?: unknown;
}

export class SnapshotDecodeError extends Error {
  readonly _tag = 'SnapshotDecodeError';

  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'SnapshotDecodeError';
  }
}

export class SnapshotIdentityConflict extends Error {
  readonly _tag = 'SnapshotIdentityConflict';

  constructor(readonly identity: string) {
    super(`Snapshot identity "${identity}" is claimed by different ESchemas`);
    this.name = 'SnapshotIdentityConflict';
  }
}
