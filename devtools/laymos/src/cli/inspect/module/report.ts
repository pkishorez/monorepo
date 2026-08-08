import * as colors from 'yoctocolors';

import type { ModuleInspection } from '../../../orchestrator/inspect/index.js';
import { renderPathTree, type PathTreeEntry } from '../path-tree.js';

export function renderModuleInspection(inspection: ModuleInspection): string {
  const entries: PathTreeEntry[] = [
    ...inspection.dependents.map((path) => ({
      path,
      kind: 'dependent' as const,
    })),
    ...inspection.dependencies.map((path) => ({
      path,
      kind: 'dependency' as const,
    })),
  ];
  const output = [
    `Module:   ${inspection.module.path}`,
    `Layer:    ${inspection.module.layer}`,
    `Kind:     ${inspection.module.kind}`,
    `Shared:   ${inspection.module.shared ? 'yes' : 'no'}`,
    `Exposure: ${inspection.exposure}`,
    'Public entry points:',
    ...(inspection.publicEntryPoints.length === 0
      ? ['  none']
      : inspection.publicEntryPoints.map((path) => `  ${path}`)),
    '',
    `${colors.green('■')} active   ${colors.cyan('■')} dependents   ${colors.yellow('■')} dependencies`,
    '',
    renderPathTree(inspection.module.path, entries),
  ];
  if (inspection.hasViolations) {
    output.push(
      '',
      colors.yellow('Warning: this Module has architecture violations.'),
      'Run `laymos lint modules` for details.',
    );
  }
  return output.join('\n');
}
