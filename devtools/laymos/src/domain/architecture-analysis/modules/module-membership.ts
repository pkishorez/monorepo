import type { ModuleDefinition } from './modules.js';

export function assignFilesToModules(
  files: Iterable<string>,
  modules: Readonly<Record<string, ModuleDefinition>>,
): ReadonlyMap<string, string> {
  const roots = Object.keys(modules).sort();
  const membership = new Map<string, string>();
  for (const file of files) {
    const root = roots.find(
      (candidate) =>
        candidate === '.' ||
        file === candidate ||
        file.startsWith(`${candidate}/`),
    );
    if (root !== undefined) membership.set(file, root);
  }
  return membership;
}
