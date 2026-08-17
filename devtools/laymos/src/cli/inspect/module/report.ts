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
    `Graph:    ${inspection.module.graph ?? 'none'}`,
    `Shared:   ${inspection.module.shared}`,
    `Exposed:  ${inspection.module.exposed}`,
    `Shape:    ${inspection.module.shape}`,
    `Observed: ${inspection.module.observedKind}`,
    ...(inspection.graphRules === undefined
      ? []
      : [`May import: ${inspection.graphRules.join(', ') || 'none'}`]),
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
