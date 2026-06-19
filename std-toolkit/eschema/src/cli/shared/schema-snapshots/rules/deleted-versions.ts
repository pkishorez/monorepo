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
  const orphanedSnapshots = new Set(
    schema.snapshotFiles
      .filter((snapshotFile) => !versions.has(snapshotFile.version))
      .map((snapshotFile) => snapshotFile.version),
  );

  return Object.keys(schema.manifest.values)
    .filter((version) => !versions.has(version))
    .map((version) => {
      const hasOrphanedSnapshot = orphanedSnapshots.has(version);
      const fix = hasOrphanedSnapshot
        ? `Remove the ${version} entry from snapshots.json and delete __snapshots__/${version}.ts.snap.`
        : `Remove the ${version} entry from snapshots.json.`;
      return issue(
        'MissingVersionFile',
        schema.path,
        { path: join(schema.versionsDirectory, `${version}.ts`), version },
        `versions/${version}.ts was deleted manually but snapshots.json still references it. ${fix}`,
      );
    });
}
