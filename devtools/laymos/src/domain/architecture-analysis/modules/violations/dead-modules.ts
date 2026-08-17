import type { ModuleAnalysisContext, ModuleViolation } from '../modules.js';

// A Module nothing may import and nothing does. Module Graphs are closed, so a
// member reachable by no Rule and not exposed is unambiguously dead; a free-form
// Module in a root Layer is an Intentional root the host reaches.
export function findDeadModuleViolations(
  context: ModuleAnalysisContext,
  edges: ReadonlyMap<string, ReadonlySet<string>>,
): readonly ModuleViolation[] {
  const dependents = new Set(
    [...edges].flatMap(([, destinations]) => [...destinations]),
  );
  return Object.entries(context.modules)
    .filter(([module, definition]) => {
      if (definition.exposed) return false;
      if (definition.graph !== undefined) {
        return !reachableByRule(context, definition.graph, definition.member);
      }
      if (definition.shared) return false;
      return (
        !context.rootLayers.has(definition.layer) && !dependents.has(module)
      );
    })
    .map(([module]) => ({ kind: 'dead-module' as const, module }))
    .sort((left, right) => left.module.localeCompare(right.module));
}

function reachableByRule(
  context: ModuleAnalysisContext,
  graph: string,
  member: string | undefined,
): boolean {
  const rules = context.graphs[graph]?.rules ?? {};
  return Object.values(rules).some((destinations) =>
    destinations.includes(member ?? ''),
  );
}
