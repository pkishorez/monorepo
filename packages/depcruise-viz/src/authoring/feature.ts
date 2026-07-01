import type { Feature } from '../types.js';

/**
 * Declares a feature: a named rooted DAG of module references. `root` must
 * be present in `modules`; it is the single entry-point module (top-most
 * layer). All membership is explicit — edges are derived from the real import
 * graph, never inferred from declarations.
 */
export function feature(
  name: string,
  opts: { root: string; modules: string[]; description?: string },
): Feature {
  if (name.length === 0) {
    throw new Error('Feature name must not be empty');
  }
  if (opts.root.length === 0) {
    throw new Error(`Feature "${name}" root must not be empty`);
  }
  if (!opts.modules.includes(opts.root)) {
    throw new Error(
      `Feature "${name}" root "${opts.root}" must be present in modules`,
    );
  }
  return {
    kind: 'feature',
    name,
    root: opts.root,
    modules: [...opts.modules],
    config:
      opts.description !== undefined ? { description: opts.description } : {},
  };
}
