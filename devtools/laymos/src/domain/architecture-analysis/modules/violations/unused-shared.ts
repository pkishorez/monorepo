import type { ModuleAnalysisContext, ModuleViolation } from '../modules.js';

export function findUnusedSharedViolations(
  context: ModuleAnalysisContext,
  edges: ReadonlyMap<string, ReadonlySet<string>>,
): readonly ModuleViolation[] {
  return Object.entries(context.modules).flatMap(([module, definition]) => {
    if (!definition.shared) return [];
    const hasPeerDependent = [...edges].some(
      ([fromModule, toModules]) =>
        toModules.has(module) &&
        context.modules[fromModule]?.layer === definition.layer,
    );
    return hasPeerDependent ? [] : [{ kind: 'unused-shared' as const, module }];
  });
}
