import * as colors from 'yoctocolors';

import type { FileInspection } from '../../../orchestrator/inspect/index.js';
import { renderPathTree } from '../path-tree.js';

export function renderFileInspection(inspection: FileInspection): string {
  const legend = inspection.recursive
    ? `${colors.green('■')} active   ${colors.yellow('■')} direct dependency   ${colors.gray('■')} transitive dependency`
    : `${colors.green('■')} active   ${colors.yellow('■')} direct dependency`;
  const output = [
    `File:   ${inspection.path}`,
    `Module: ${inspection.role === 'uncovered' ? 'none' : inspection.owner}`,
    `Role:   ${renderRole(inspection.role)}`,
    '',
    legend,
    '',
    renderPathTree(inspection.path, inspection.dependencies),
  ];
  if (inspection.role === 'uncovered') {
    output.push(
      '',
      colors.yellow('Warning: no Module owns this file.'),
      'Run `laymos lint` for details.',
    );
  }
  return output.join('\n');
}

function renderRole(role: FileInspection['role']): string {
  switch (role) {
    case 'index':
      return 'Index';
    case 'own':
      return 'own file';
    case 'uncovered':
      return 'in a Wrapper, owned by no Module';
  }
}
