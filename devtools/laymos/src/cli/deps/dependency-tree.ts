import * as colors from 'yoctocolors';

import type {
  DependencyEntry,
  PathTreeNode,
} from '../../domain/file-graph/index.js';
import { groupByPath } from '../../domain/file-graph/index.js';

export function renderDependencyTree(
  target: string,
  entries: readonly DependencyEntry[],
): string {
  return [renderLegend(), '', ...renderRoot(groupByPath(target, entries))].join(
    '\n',
  );
}

// A lone root drawn with a "└── " connector reads oddly when it's the only
// thing at that level (nothing else for the connector to distinguish it
// from) — print it bare and start the connectors one level down instead.
function renderRoot(nodes: readonly PathTreeNode[]): string[] {
  if (nodes.length !== 1) return renderNodes(nodes, '');
  const root = nodes[0]!;
  const label =
    root.kind === undefined ? root.name : colorize(root.name, root.kind);
  return [label, ...renderNodes(root.children, '')];
}

function renderLegend(): string {
  return [
    `${colors.green('■')} target`,
    `${colors.yellow('■')} direct dependency`,
    `${colors.gray('■')} transitive dependency`,
  ].join('   ');
}

function renderNodes(nodes: readonly PathTreeNode[], prefix: string): string[] {
  return nodes.flatMap((node, index) => {
    const isLast = index === nodes.length - 1;
    const connector = isLast ? '└── ' : '├── ';
    const childPrefix = prefix + (isLast ? '    ' : '│   ');
    const label =
      node.kind === undefined ? node.name : colorize(node.name, node.kind);
    return [
      `${prefix}${connector}${label}`,
      ...renderNodes(node.children, childPrefix),
    ];
  });
}

function colorize(
  label: string,
  kind: NonNullable<PathTreeNode['kind']>,
): string {
  if (kind === 'target') return colors.green(label);
  return kind === 'direct' ? colors.yellow(label) : colors.gray(label);
}
