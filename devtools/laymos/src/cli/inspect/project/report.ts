import * as colors from 'yoctocolors';

import type {
  ModuleTree,
  TreeNode,
} from '../../../architecture-analysis-schema/index.js';
import { violationsOf } from '../../../domain/architecture-analysis/index.js';
import type { ProjectInspection } from '../../../orchestrator/inspect/index.js';

export function renderProjectInspection(inspection: ProjectInspection): string {
  const { tree, config } = inspection;
  const modules = tree.nodes.filter(({ kind }) => kind === 'module');
  const violations = violationsOf(inspection);
  const rules = Object.entries(config.rules).flatMap(([from, targets]) =>
    targets.map((to) => `  ${from} → ${to}`),
  );
  const exceptions = config.exceptions.map(
    ({ from, to, because }) => `  ${from} → ${to}  ${colors.dim(because)}`,
  );
  return [
    `Modules: ${modules.length}`,
    `Violations: ${violations.length}`,
    '',
    ...renderTree(tree, tree.root, ''),
    '',
    'Rules:',
    ...(rules.length === 0 ? ['  none'] : rules),
    'Exceptions:',
    ...(exceptions.length === 0 ? ['  none'] : exceptions),
  ].join('\n');
}

function renderTree(
  tree: ModuleTree,
  path: string,
  prefix: string,
): readonly string[] {
  const node = tree.nodes.find((candidate) => candidate.path === path)!;
  const children = node.children.map((child) =>
    tree.nodes.find((candidate) => candidate.path === child)!,
  );
  return [
    renderLabel(node, prefix === ''),
    ...children.flatMap((child, index) => {
      const isLast = index === children.length - 1;
      const [label, ...rest] = renderTree(
        tree,
        child.path,
        prefix + (isLast ? '    ' : '│   '),
      );
      return [`${prefix}${isLast ? '└── ' : '├── '}${label}`, ...rest];
    }),
  ];
}

function renderLabel(node: TreeNode, isRoot: boolean): string {
  const name = isRoot ? node.path : (node.path.split('/').pop() ?? node.path);
  if (node.kind === 'wrapper') return colors.dim(name);
  return node.shape === 'file' ? colors.cyan(name) : colors.green(name);
}
