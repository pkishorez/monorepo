import { issue } from '../issue.js';
import type { SchemaRootSource, SnapshotIssue } from '../model.js';

export function checkStructure(
  schema: SchemaRootSource,
): readonly SnapshotIssue[] {
  const issues: SnapshotIssue[] = [];

  if (schema.manifest.invalid) {
    issues.push(
      issue('InvalidSnapshotsJson', schema.path, {
        path: schema.manifest.path,
      }),
    );
  }

  if (schema.schemaFileContent === null) {
    issues.push(
      issue('MissingSchemaFile', schema.path, { path: schema.schemaFile }),
    );
  }

  if (!schema.versionsDirectoryExists) {
    issues.push(
      issue('MissingVersionsDirectory', schema.path, {
        path: schema.versionsDirectory,
      }),
    );
  }

  return issues;
}
