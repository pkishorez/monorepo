import type { ModuleDef, ModuleRules } from './types.js';
import { normalizeConfigPath } from './path.js';

export function module(
  path: string,
  options: { readonly description: string },
): ModuleDef {
  if (path.length === 0) {
    throw new Error('Module path must not be empty');
  }
  return {
    kind: 'module',
    path: normalizeConfigPath(path),
    description: options.description,
  };
}

export function rules(
  module: ModuleDef,
  constraints: {
    canImport?: readonly ModuleDef[];
    canImportedBy?: readonly ModuleDef[];
  },
): ModuleRules {
  if (
    constraints.canImport === undefined &&
    constraints.canImportedBy === undefined
  ) {
    throw new Error(
      `Rules for module "${module.path}" must declare canImport or canImportedBy`,
    );
  }
  return {
    kind: 'module-rules',
    module,
    ...(constraints.canImport !== undefined
      ? { canImport: constraints.canImport }
      : {}),
    ...(constraints.canImportedBy !== undefined
      ? { canImportedBy: constraints.canImportedBy }
      : {}),
  };
}
