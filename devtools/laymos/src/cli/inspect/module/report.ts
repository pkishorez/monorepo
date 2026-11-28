import { cyan, dim, green, yellow } from 'yoctocolors';

import type { ModuleInspection } from '../../../orchestrator/inspect/index.js';
import { renderPathTree, type PathTreeEntry } from '../path-tree.js';

export function renderModuleInspection(inspection: ModuleInspection): string {
  const { node, reach } = inspection;
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
    `${node.kind === 'module' ? 'Module: ' : 'Wrapper:'} ${node.path}`,
    `Shape:   ${node.shape}`,
    `Index:   ${node.index ?? 'none'}`,
    `Nested:  ${node.children.length === 0 ? 'none' : node.children.join(', ')}`,
    'May import:',
    ...(reach.rules.length === 0
      ? ['  nothing by Rule']
      : reach.rules.map(
          ({ from, to }) => `  ${to}  ${dim(`by ${from} → ${to}`)}`,
        )),
    ...reach.exceptions.map(
      ({ from, to, because }) =>
        `  ${to}  ${dim(`by exception ${from} → ${to}: ${because}`)}`,
    ),
    '',
    `${green('■')} active   ${cyan('■')} dependents   ${yellow('■')} dependencies`,
    '',
    renderPathTree(node.path, entries),
  ];
  if (inspection.hasViolations) {
    output.push(
      '',
      yellow('Warning: this Module has violations.'),
      'Run `laymos lint` for details.',
    );
  }
  return output.join('\n');
}
