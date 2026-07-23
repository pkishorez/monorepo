import type { ModuleDef, ModuleRules } from './types.js';
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
