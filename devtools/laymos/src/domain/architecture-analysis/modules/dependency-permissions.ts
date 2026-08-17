import type { ModuleAnalysisContext } from './modules.js';

export type ModuleImportPermission =
  | 'layer-denied'
  | 'module-denied'
  | 'permitted';

// A Module Graph member may import its own Graph's members where a Rule permits,
// free-form Shared Modules in its Layer, and exposed Modules in Layers it may
// reach. Never a member of another Module Graph.
export function importPermission(
  context: ModuleAnalysisContext,
  fromFile: string,
  toFile: string,
  fromModule: string,
  toModule: string,
): ModuleImportPermission {
  const fromLayer = context.layerContext.membership.get(fromFile);
  const toLayer = context.layerContext.membership.get(toFile);
  if (fromLayer === undefined || toLayer === undefined) return 'layer-denied';
  const from = context.modules[fromModule];
  const to = context.modules[toModule];
  if (to === undefined) return 'module-denied';

  if (fromLayer !== toLayer) {
    if (
      !context.layerContext.allowedDependencies.get(fromLayer)?.has(toLayer)
    ) {
      return 'layer-denied';
    }
    return to.exposed ? 'permitted' : 'module-denied';
  }

  if (to.graph !== undefined) {
    return from?.graph === to.graph && permittedByRule(context, from!, to)
      ? 'permitted'
      : 'module-denied';
  }
  return to.shared ? 'permitted' : 'module-denied';
}

// Module Graph Rules are not transitive: only a declared edge permits an import.
function permittedByRule(
  context: ModuleAnalysisContext,
  from: NonNullable<ModuleAnalysisContext['modules'][string]>,
  to: NonNullable<ModuleAnalysisContext['modules'][string]>,
): boolean {
  const graph = context.graphs[to.graph!];
  if (
    graph === undefined ||
    from.member === undefined ||
    to.member === undefined
  ) {
    return false;
  }
  return graph.rules[from.member]?.includes(to.member) ?? false;
}
