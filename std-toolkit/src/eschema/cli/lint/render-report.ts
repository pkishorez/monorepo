import kleur from 'kleur';
import type { SnapshotReport } from '../shared/schema-snapshots/index.js';
import { renderIssue } from './render-issue.js';

export type LintOutput = {
  readonly exitCode: 0 | 1;
  readonly text: string;
};

const STATUS_COLOR: Record<string, (s: string) => string> = {
  approved: kleur.green,
  new: kleur.yellow,
  modified: kleur.yellow,
  'missing-file': kleur.red,
  'hash-mismatch': kleur.red,
};

function colorStatus(status: string): string {
  return (STATUS_COLOR[status] ?? kleur.white)(status);
}

export function renderLintReport(report: SnapshotReport): LintOutput {
  const lines: string[] = [kleur.bold(`Snapshot lint report: ${report.root}`)];

  if (report.schemas.length === 0) {
    lines.push('', 'No schema roots discovered.');
  }

  for (const schema of report.schemas) {
    lines.push('', kleur.bold(`Schema: ${schema.relativePath}`));
    lines.push(`Latest: ${schema.latestVersion ?? kleur.dim('unknown')}`);
    lines.push('Versions:');

    if (schema.versions.length === 0) {
      lines.push(kleur.dim('  none'));
    } else {
      for (const version of schema.versions) {
        lines.push(`  ${version.version} ${colorStatus(version.status)}`);
      }
    }

    if (schema.issues.length > 0) {
      lines.push('Issues:');
      for (const issue of schema.issues) {
        lines.push(...renderIssue(report.root, schema, issue));
      }
    }
  }

  if (report.issues.length === 0) {
    lines.push(
      '',
      kleur.green('Snapshot lint passed: all schema versions are approved.'),
    );
    return { exitCode: 0, text: lines.join('\n') };
  }

  lines.push(
    '',
    kleur.red(`Snapshot lint failed: ${report.issues.length} issue(s).`),
  );
  return { exitCode: 1, text: lines.join('\n') };
}
