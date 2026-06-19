import { join } from 'node:path';
import { issue } from '../issue.js';
import type {
  SchemaRootSource,
  SnapshotIssue,
  VersionFileSource,
} from '../model.js';

export function findDeletedVersionReferences(
  schema: SchemaRootSource,
  versionFiles: readonly VersionFileSource[],
): readonly SnapshotIssue[] {
  const versions = new Set(
    versionFiles.map((versionFile) => versionFile.version),
  );

  return [
    ...Object.keys(schema.manifest.values)
      .filter((version) => !versions.has(version))
      .map((version) =>
        issue(
          'MissingVersionFile',
          schema.path,
          { path: join(schema.versionsDirectory, `${version}.ts`), version },
          `snapshots.json references missing version file ${version}.ts`,
        ),
      ),
    ...schema.snapshotFiles
      .filter((snapshotFile) => !versions.has(snapshotFile.version))
      .map((snapshotFile) =>
        issue(
          'OrphanSnapshotFile',
          schema.path,
          { path: snapshotFile.path, version: snapshotFile.version },
          `Snapshot file ${snapshotFile.filename} has no matching version file`,
        ),
      ),
  ];
}
