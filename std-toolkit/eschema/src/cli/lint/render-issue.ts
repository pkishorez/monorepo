import { join, relative } from 'node:path';
import kleur from 'kleur';
import {
  formatUnifiedDiff,
  type SchemaSnapshotReport,
  type SnapshotIssue,
} from '../shared/schema-snapshots/index.js';

export function renderIssue(
  root: string,
  schema: SchemaSnapshotReport,
  issue: SnapshotIssue,
): readonly string[] {
  const location = issue.path
    ? relative(root, issue.path)
    : schema.relativePath;
  const version = issue.version === undefined ? '' : ` ${issue.version}`;
  const lines = [
    `  - ${kleur.red(issue._tag)}${kleur.dim(version)}: ${issue.message}`,
  ];
  lines.push(`    ${kleur.dim('path:')} ${location}`);

  if (issue.expectedHash !== undefined || issue.actualHash !== undefined) {
    lines.push(
      `    ${kleur.dim('expected:')} ${issue.expectedHash ?? kleur.red('missing')}`,
    );
    lines.push(
      `    ${kleur.dim('actual:')}   ${issue.actualHash ?? kleur.red('missing')}`,
    );
  }

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
      )
        .trimEnd()
        .split('\n')
        .map((line) => `    ${line}`)
        .join('\n'),
    );
  }

  return lines;
}
