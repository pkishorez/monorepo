import type { Layer, LayerConfig } from '../types.js';

/**
 * Declares a layer: a named band of one or more path patterns within a stack.
 *
 * Naming: a layer's `name` is its global identity. Reuse the SAME name across
 * stacks only when you intend them to be one shared layer (rendered as a single
 * spanning node); otherwise keep names distinct. When a trailing name would
 * repeat across stacks (e.g. two `internal` layers), namespace it —
 * `dynamodb/internal`, `sqlite/internal` — so they stay separate. Layers whose
 * PATHS overlap (one nested under another) are reported as conflicts, since a
 * file would then match both.
 */
export function layer(
  name: string,
  paths: string[],
  config?: LayerConfig,
): Layer {
  if (name.length === 0) {
    throw new Error('Layer name must not be empty');
  }
  if (paths.length === 0) {
    throw new Error(`Layer "${name}" must have at least one path`);
  }
  return { name, paths, config: config ?? {} };
}
