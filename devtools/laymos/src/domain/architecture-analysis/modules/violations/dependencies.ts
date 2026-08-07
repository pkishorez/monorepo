import { importPermission } from '../dependency-permissions.js';
import type { ModuleAnalysisContext } from '../modules.js';

export type DependencyClassification =
  | 'skip'
  | 'dependency-violation'
  | 'permitted';

export function classifyDependency(
  context: ModuleAnalysisContext,
  fromFile: string,
  toFile: string,
  fromModule: string,
  toModule: string,
): DependencyClassification {
  const permission = importPermission(
    context,
    fromFile,
    toFile,
    fromModule,
    toModule,
  );
  if (permission === 'layer-denied') return 'skip';
  return permission === 'module-denied' ? 'dependency-violation' : 'permitted';
}
