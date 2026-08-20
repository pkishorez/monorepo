import { Snapshot } from '../../snapshot/index.js';
import type {
  SnapshotChange,
  SnapshotDiagnostic,
} from '../../snapshot/index.js';
import { baselineFileName } from '../contract-files/index.js';

export type SnapshotCommandResult =
  | {
      readonly _tag: 'Match';
      readonly limitations: readonly SnapshotDiagnostic[];
    }
  | { readonly _tag: 'MissingBaseline' }
  | {
      readonly _tag: 'Drift';
      readonly changes: readonly SnapshotChange[];
      readonly limitations: readonly SnapshotDiagnostic[];
    }
  | { readonly _tag: 'Created' }
  | {
      readonly _tag: 'Unchanged';
      readonly limitations: readonly SnapshotDiagnostic[];
    }
  | {
      readonly _tag: 'Updated';
      readonly changes: readonly SnapshotChange[];
      readonly limitations: readonly SnapshotDiagnostic[];
    };

export interface SnapshotOutcome {
  readonly exitCode: 0 | 1;
  readonly output: string;
}

function sections(...values: readonly (string | undefined)[]): string {
  return values
    .filter((value): value is string => value !== undefined)
    .join('\n\n');
}

function count(changes: readonly SnapshotChange[]): string {
  return `${changes.length} snapshot ${changes.length === 1 ? 'change' : 'changes'}`;
}

function limitationPath(path: string): string {
  const values = path
    .split('/')
    .filter(Boolean)
    .map((value) => value.replaceAll('~1', '/').replaceAll('~0', '~'));
  const schema = values[0] === 'schemas' ? values[1] : undefined;
  const versionIndex = values.indexOf('versions');
  const version = versionIndex < 0 ? undefined : values[versionIndex + 1];
  const fields = values.flatMap((value, index) =>
    values[index - 1] === 'properties' ? [value] : [],
  );
  return [schema, version, ...fields].filter(Boolean).join(' › ') || path;
}

function limitations(
  values: readonly SnapshotDiagnostic[],
): string | undefined {
  if (values.length === 0) return undefined;
  return [
    'LIMITATIONS',
    ...values.map((item) => `  ${limitationPath(item.path)}: ${item.message}`),
  ].join('\n');
}

export function renderSnapshotResult(
  result: SnapshotCommandResult,
): SnapshotOutcome {
  switch (result._tag) {
    case 'Match': {
      const currentLimitations = limitations(result.limitations);
      return {
        exitCode: 0,
        output: sections(
          currentLimitations === undefined
            ? 'PASS  Snapshot matches'
            : 'PASS WITH LIMITATIONS  Snapshot matches',
          currentLimitations,
        ),
      };
    }
    case 'MissingBaseline':
      return {
        exitCode: 1,
        output: sections(
          'FAIL  No approved snapshot found',
          'Run: std-toolkit snapshot approve',
        ),
      };
    case 'Drift':
      return {
        exitCode: 1,
        output: sections(
          `FAIL  ${count(result.changes)} ${result.changes.length === 1 ? 'needs' : 'need'} approval`,
          Snapshot.renderChanges(result.changes),
          limitations(result.limitations),
          'Run: std-toolkit snapshot approve',
        ),
      };
    case 'Created':
      return { exitCode: 0, output: `APPROVED  ${baselineFileName}` };
    case 'Unchanged':
      return {
        exitCode: 0,
        output: sections(
          'ALREADY APPROVED  No snapshot changes',
          limitations(result.limitations),
        ),
      };
    case 'Updated':
      return {
        exitCode: 0,
        output: sections(
          `APPROVED  ${count(result.changes)}`,
          Snapshot.renderChanges(result.changes),
          limitations(result.limitations),
        ),
      };
  }
}
