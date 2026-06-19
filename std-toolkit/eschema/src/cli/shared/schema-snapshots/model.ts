import { Data, FileSystem } from 'effect';

export class SnapshotAnalysisError extends Data.TaggedError(
  'SnapshotAnalysisError',
)<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export type SnapshotIssue = {
  readonly _tag:
    | 'MissingSchemaFile'
    | 'MissingVersionsDirectory'
    | 'InvalidVersionFilename'
    | 'NonContiguousVersions'
    | 'MissingVersionExport'
    | 'SchemaDoesNotBuildLatest'
    | 'InvalidSnapshotsJson'
    | 'NewVersion'
    | 'MissingSnapshotFile'
    | 'SnapshotHashMismatch'
    | 'ModifiedVersion'
    | 'MissingVersionFile'
    | 'OrphanSnapshotFile';
  readonly schemaPath: string;
  readonly path?: string;
  readonly version?: string;
  readonly message: string;
  readonly expected?: string;
  readonly actual?: string;
  readonly expectedHash?: string;
  readonly actualHash?: string;
};

export type VersionSnapshotReport = {
  readonly version: string;
  readonly versionFile: string;
  readonly snapshotFile: string;
  readonly status:
    | 'approved'
    | 'new'
    | 'modified'
    | 'missing-file'
    | 'hash-mismatch'
    | 'invalid';
};

export type SchemaSnapshotReport = {
  readonly path: string;
  readonly relativePath: string;
  readonly latestVersion: string | null;
  readonly versions: readonly VersionSnapshotReport[];
  readonly issues: readonly SnapshotIssue[];
};

export type SnapshotReport = {
  readonly root: string;
  readonly schemas: readonly SchemaSnapshotReport[];
  readonly issues: readonly SnapshotIssue[];
};

export type SchemaCollectionSource = {
  readonly root: string;
  readonly schemas: readonly SchemaRootSource[];
};

export type SchemaRootSource = {
  readonly path: string;
  readonly relativePath: string;
  readonly schemaFile: string;
  readonly schemaFileContent: string | null;
  readonly versionsDirectory: string;
  readonly versionsDirectoryExists: boolean;
  readonly snapshotsDirectory: string;
  readonly snapshotFiles: readonly SnapshotFileSource[];
  readonly manifest: ManifestSource;
  readonly versionFiles: readonly VersionFileSource[];
};

export type VersionFileSource = {
  readonly version: string;
  readonly number: number;
  readonly path: string;
  readonly filename: string;
  readonly content: string;
  readonly validName: boolean;
};

export type SnapshotFileSource = {
  readonly version: string;
  readonly path: string;
  readonly filename: string;
  readonly content: string;
};

export type ManifestSource = {
  readonly path: string;
  readonly exists: boolean;
  readonly values: Record<string, string>;
  readonly invalid: boolean;
};

export type SnapshotAnalysis = FileSystem.FileSystem;
