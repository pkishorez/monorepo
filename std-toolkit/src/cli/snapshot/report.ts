import { Snapshot } from '../../snapshot/index.js';
import type { ContractSnapshot } from '../../snapshot/index.js';
import { baselineFileName } from '../contract-files/index.js';

const approveCommand = 'std-toolkit snapshot approve';
const viewCommand = 'std-toolkit snapshot view';

export function joinSections(
  ...sections: readonly (string | undefined)[]
): string {
  return sections
    .filter((section): section is string => section !== undefined)
    .join('\n\n');
}

export function renderDiagnostics(
  snapshot: ContractSnapshot,
): string | undefined {
  const diagnostics = Snapshot.inspect(snapshot);
  if (diagnostics.length === 0) return undefined;
  return [
    'WARNINGS',
    '',
    ...diagnostics.flatMap((diagnostic, index) => [
      ...(index === 0 ? [] : ['']),
      `  ${diagnostic.message}`,
      `  ${diagnostic.path}`,
    ]),
  ].join('\n');
}

export function renderMissingBaseline(): string {
  return joinSections(
    `No approved snapshot found: ${baselineFileName}`,
    `Review it with \`${viewCommand}\`, then approve with:\n\n  ${approveCommand}`,
  );
}

export function renderDriftHint(): string {
  return `Review the changes, then approve them with:\n\n  ${approveCommand}`;
}

export function renderApproval(created: boolean): string {
  return created
    ? `✓ Approved snapshot written to ${baselineFileName}`
    : `✓ Approved snapshot updated: ${baselineFileName}`;
}
