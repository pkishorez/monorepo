import type { ModuleAnalysisContext, ModuleViolation } from '../modules.js';

export function findCoverageViolations(
  context: ModuleAnalysisContext,
): readonly ModuleViolation[] {
  return [...context.fileGraph.keys()]
    .filter(
      (file) =>
        context.layerContext.membership.has(file) &&
        !context.membership.has(file),
    )
    .sort()
    .map((file) => ({ kind: 'coverage' as const, file }));
}
