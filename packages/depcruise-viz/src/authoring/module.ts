import type { ModuleDecl, ModuleRules } from '../types.js';

/**
 * Declares a module: a single folder or file in exactly one layer identified
 * by `path`. `name` overrides the path-derived display name. Set
 * `opaque: true` to treat the module as a barrel — its outgoing dependencies
 * are not analyzed. `rules` declares enforced constraints on the module's
 * edges: `root` / `leaf` booleans, or `onlyImports` / `onlyImportedBy` sets
 * referencing other declared modules by path.
 */
export function module(
  path: string,
  opts?: { name?: string; opaque?: boolean; rules?: ModuleRules },
): ModuleDecl {
  if (path.length === 0) {
    throw new Error('Module path must not be empty');
  }
  if (opts?.rules) {
    validateRules(path, opts.rules);
  }
  const decl: ModuleDecl = {
    path,
    opaque: opts?.opaque ?? false,
    ...(opts?.rules === undefined ? {} : { rules: opts.rules }),
  };
  return opts?.name === undefined ? decl : { ...decl, name: opts.name };
}

function validateRules(path: string, rules: ModuleRules): void {
  if (rules.root && rules.onlyImportedBy !== undefined) {
    throw new Error(
      `Module "${path}": "root" contradicts "onlyImportedBy" — root means no module may import this`,
    );
  }
  if (rules.leaf && rules.onlyImports !== undefined) {
    throw new Error(
      `Module "${path}": "leaf" contradicts "onlyImports" — leaf means this module may import no module`,
    );
  }
}
