import { join } from 'node:path';
import { issue } from '../issue.js';
import { hashSnapshotContent } from '../hash.js';
import type {
  SchemaRootSource,
  SnapshotIssue,
  VersionFileSource,
  VersionSnapshotReport,
} from '../model.js';

export type SnapshotStateAnalysis = {
  readonly versions: readonly VersionSnapshotReport[];
  readonly issues: readonly SnapshotIssue[];
};

export function describeSnapshotState(
  schema: SchemaRootSource,
  versionFiles: readonly VersionFileSource[],
): SnapshotStateAnalysis {
  const versionAnalyses = versionFiles.map((versionFile) =>
    analyzeVersion(schema, versionFile),
  );

  return {
    versions: versionAnalyses.map((analysis) => analysis.version),
    issues: versionAnalyses.flatMap((analysis) => analysis.issues),
  };
}

function analyzeVersion(
  schema: SchemaRootSource,
  versionFile: VersionFileSource,
): {
  readonly version: VersionSnapshotReport;
  readonly issues: readonly SnapshotIssue[];
} {
  const issues: SnapshotIssue[] = [];
  const snapshotFile = join(
    schema.snapshotsDirectory,
    `${versionFile.version}.ts.snap`,
  );
  const snapshot = schema.snapshotFiles.find(
    (file) => file.version === versionFile.version,
  );
  let status: VersionSnapshotReport['status'] = 'approved';

  if (!(versionFile.version in schema.manifest.values)) {
    status = 'new';
    issues.push(
      issue(
        'NewVersion',
        schema.path,
        { path: versionFile.path, version: versionFile.version },
        `Version ${versionFile.version} is not in snapshots.json`,
      ),
    );
  }

  if (snapshot === undefined) {
    status = status === 'new' ? 'new' : 'missing-file';
    if (status !== 'new') {
      issues.push(
        issue(
          'MissingSnapshotFile',
          schema.path,
          { path: snapshotFile, version: versionFile.version },
          `Missing snapshot file for ${versionFile.version}`,
        ),
      );
    }
  } else {
    if (snapshot.content !== versionFile.content) {
      status = status === 'new' ? 'new' : 'modified';
      issues.push({
        ...issue(
          'ModifiedVersion',
          schema.path,
          { path: versionFile.path, version: versionFile.version },
          `Version ${versionFile.version} differs from its approved snapshot`,
        ),
        expected: snapshot.content,
        actual: versionFile.content,
      });
    }

    const manifestHash = schema.manifest.values[versionFile.version];
    const actualHash = hashSnapshotContent(snapshot.content);
    if (manifestHash !== undefined && manifestHash !== actualHash) {
      status = 'hash-mismatch';
      issues.push({
        ...issue(
          'SnapshotHashMismatch',
          schema.path,
          { path: snapshot.path, version: versionFile.version },
          `Snapshot hash mismatch for ${versionFile.version}`,
        ),
        expectedHash: manifestHash,
        actualHash,
      });
    }
  }

  return {
    version: {
      version: versionFile.version,
      versionFile: versionFile.path,
      snapshotFile,
      status,
    },
    issues,
  };
}
