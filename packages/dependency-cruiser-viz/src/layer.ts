import type { Layer, LayerConfig } from './types.js';

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
