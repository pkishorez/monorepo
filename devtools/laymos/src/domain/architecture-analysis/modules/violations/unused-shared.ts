import type { ModuleAnalysisContext, ModuleViolation } from '../modules.js';

export function findUnusedSharedViolations(
  context: ModuleAnalysisContext,
  edges: ReadonlyMap<string, ReadonlySet<string>>,
): readonly ModuleViolation[] {
  const layers = moduleLayers(context);
  return Object.entries(context.modules).flatMap(([module, definition]) => {
    if (definition.kind !== 'shared') return [];
    const layer = layers.get(module);
    const hasPeerDependent = [...edges].some(
      ([fromModule, toModules]) =>
        toModules.has(module) && layers.get(fromModule) === layer,
    );
    return hasPeerDependent ? [] : [{ kind: 'unused-shared' as const, module }];
  });
}

function moduleLayers(
  context: ModuleAnalysisContext,
): ReadonlyMap<string, string> {
  const layers = new Map<string, string>();
  for (const [file, module] of context.membership) {
    if (layers.has(module)) continue;
    const layer = context.layerContext.membership.get(file);
    if (layer !== undefined) layers.set(module, layer);
  }
  return layers;
}
