import * as colors from 'yoctocolors';

import type { FileInspection } from '../../../orchestrator/inspect/index.js';
import { renderPathTree } from '../path-tree.js';

export function renderFileInspection(inspection: FileInspection): string {
  const legend = inspection.recursive
    ? `${colors.green('■')} active   ${colors.yellow('■')} direct dependency   ${colors.gray('■')} transitive dependency`
    : `${colors.green('■')} active   ${colors.yellow('■')} direct dependency`;
  const output = [
    `File:   ${inspection.path}`,
    `Layer:  ${inspection.layer ?? 'unassigned'}`,
    `Module: ${inspection.module ?? 'unassigned'}`,
    `Role:   ${renderRole(inspection.role)}`,
    '',
    legend,
    '',
    renderPathTree(inspection.path, inspection.dependencies),
  ];
  if (inspection.hasCoverageViolation) {
    output.push(
      '',
      colors.yellow('Warning: this file has architecture coverage violations.'),
      'Run `laymos lint` for details.',
    );
  }
  return output.join('\n');
}

function renderRole(role: FileInspection['role']): string {
  if (role === 'public-entry-point') return 'public entry point';
  return role ?? 'unassigned';
}
