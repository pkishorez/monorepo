import type { ModuleAnalysisContext, ModuleViolation } from '../modules.js';

// Everything below a Module Graph's root must belong to one of its members.
export function findGraphCoverageViolations(
  context: ModuleAnalysisContext,
): readonly ModuleViolation[] {
  return Object.entries(context.graphs)
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([graph, definition]) => {
      const members = new Set(Object.values(definition.members));
      return [...context.fileGraph.keys()]
        .filter((file) => contains(definition.path, file))
        .filter((file) => !members.has(context.membership.get(file) ?? ''))
        .sort()
        .map((file) => ({ kind: 'graph-coverage' as const, graph, file }));
    });
}

function contains(parent: string, child: string): boolean {
  return parent === '.' || child === parent || child.startsWith(`${parent}/`);
}
