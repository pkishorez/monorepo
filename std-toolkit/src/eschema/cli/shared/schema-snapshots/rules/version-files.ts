import { join } from 'node:path';
import { issue } from '../issue.js';
import type {
  SchemaRootSource,
  SnapshotIssue,
  VersionFileSource,
} from '../model.js';

export type VersionFilesAnalysis = {
  readonly validVersionFiles: readonly VersionFileSource[];
  readonly latestVersion: number | null;
  readonly latestVersionName: string | null;
  readonly issues: readonly SnapshotIssue[];
};

export function describeVersionFiles(
  schema: SchemaRootSource,
): VersionFilesAnalysis {
  const invalidNameIssues = schema.versionFiles
    .filter((versionFile) => !versionFile.validName)
    .map((versionFile) =>
      issue(
        'InvalidVersionFilename',
        schema.path,
        { path: versionFile.path },
        `Invalid version filename: ${versionFile.filename}`,
      ),
    );

  const validVersionFiles = schema.versionFiles.filter(
    (versionFile) => versionFile.validName,
  );
  const latestVersion = latestContiguousVersion(validVersionFiles);
  const latestVersionName = latestVersion === null ? null : `v${latestVersion}`;

  return {
    validVersionFiles,
    latestVersion,
    latestVersionName,
    issues: [
      ...invalidNameIssues,
      ...findContinuityIssues(schema, validVersionFiles),
      ...findExportIssues(schema, validVersionFiles),
    ],
  };
}

function latestContiguousVersion(
  versionFiles: readonly VersionFileSource[],
): number | null {
  let latest: number | null = null;
  for (const versionFile of versionFiles) {
    if (versionFile.number !== (latest ?? 0) + 1) {
      break;
    }
    latest = versionFile.number;
  }
  return latest;
}

function findContinuityIssues(
  schema: SchemaRootSource,
  versionFiles: readonly VersionFileSource[],
): readonly SnapshotIssue[] {
  const issues: SnapshotIssue[] = [];
  const numbers = new Set(
    versionFiles.map((versionFile) => versionFile.number),
  );
  const highest = Math.max(0, ...numbers);

  for (let number = 1; number <= highest; number++) {
    if (!numbers.has(number)) {
      issues.push(
        issue(
          'NonContiguousVersions',
          schema.path,
          {
            path: join(schema.versionsDirectory, `v${number}.ts`),
            version: `v${number}`,
          },
          `Missing version v${number}.ts in contiguous version chain`,
        ),
      );
    }
  }

  return issues;
}

function findExportIssues(
  schema: SchemaRootSource,
  versionFiles: readonly VersionFileSource[],
): readonly SnapshotIssue[] {
  return versionFiles
    .filter((versionFile) => !hasVersionExport(versionFile))
    .map((versionFile) =>
      issue(
        'MissingVersionExport',
        schema.path,
        { path: versionFile.path, version: versionFile.version },
        `${versionFile.version}.ts must export a const named '${versionFile.version}'`,
      ),
    );
}

function hasVersionExport(versionFile: VersionFileSource): boolean {
  return new RegExp(`export\\s+const\\s+${versionFile.version}\\b`).test(
    versionFile.content,
  );
}
