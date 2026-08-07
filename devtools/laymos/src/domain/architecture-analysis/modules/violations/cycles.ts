import { findModuleCycles } from '../dependency-graph.js';
import type { ModuleViolation } from '../modules.js';

export function findCycleViolations(
  edges: ReadonlyMap<string, ReadonlySet<string>>,
): readonly ModuleViolation[] {
  return findModuleCycles(edges).map((modules) => ({
    kind: 'cycle' as const,
    modules,
  }));
}
