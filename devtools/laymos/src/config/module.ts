import type { ModuleDef, ModuleGroup, ModuleRules } from './types.js';
import type { MarkdownContent } from '../markdown/index.js';

export function module(
  path: string,
  options: {
    readonly description: string;
    readonly documentation?: MarkdownContent;
  },
): ModuleDef {
  return {
    kind: 'module',
    path,
    description: options.description,
    ...(options.documentation === undefined
      ? {}
      : { documentation: options.documentation }),
  };
}

/**
 * Declares a Module Group: a named, described cluster of sibling Modules that
 * all live in the same Layer. Members must be values already declared in
 * `config.modules`. Purely organizational — it imposes no import rule and only
 * drives progressive disclosure in the visualization.
 */
export function group(
  name: string,
  modules: readonly ModuleDef[],
  options: { readonly description: string },
): ModuleGroup {
  return {
    kind: 'module-group',
    name,
    description: options.description,
    modules,
  };
}

export function rules(
  module: ModuleDef,
  constraints: {
    canImport?: readonly ModuleDef[];
    canImportedBy?: readonly ModuleDef[];
  },
): ModuleRules {
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
