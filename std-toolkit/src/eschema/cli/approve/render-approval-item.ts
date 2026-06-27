import { join, relative } from 'node:path';
import {
  formatUnifiedDiff,
  type SchemaSnapshotReport,
  type SnapshotIssue,
} from '../shared/schema-snapshots/index.js';

export function renderApprovalItem(
  root: string,
  schema: SchemaSnapshotReport,
  issue: SnapshotIssue,
): string {
  const location = issue.path
    ? relative(root, issue.path)
    : schema.relativePath;
  const lines = [
    '',
    `Schema: ${schema.relativePath}`,
    `Issue: ${issue._tag} ${issue.version ?? ''}`.trimEnd(),
    `Message: ${issue.message}`,
    `Path: ${location}`,
  ];

  if (
    issue._tag === 'ModifiedVersion' &&
    issue.expected !== undefined &&
    issue.actual !== undefined &&
    issue.version !== undefined
  ) {
    lines.push(
      formatUnifiedDiff(
        relative(
          root,
          join(issue.schemaPath, '__snapshots__', `${issue.version}.ts.snap`),
        ),
        issue.expected,
        location,
        issue.actual,
      ).trimEnd(),
    );
  }

  return lines.join('\n');
}
