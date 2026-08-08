import type { ModuleAnalysisContext } from './modules.js';

export type ModuleImportPermission =
  | 'layer-denied'
  | 'module-denied'
  | 'permitted';

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
  if (fromLayer !== toLayer) {
    return context.layerContext.allowedDependencies.get(fromLayer)?.has(toLayer)
      ? 'permitted'
      : 'layer-denied';
  }
  return context.modules[toModule]?.shared === true
    ? 'permitted'
    : 'module-denied';
}
