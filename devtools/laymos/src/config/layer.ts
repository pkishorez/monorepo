import type { Layer } from './types.js';
import { normalizeConfigPath } from './path.js';

export function layer(
  name: string,
  paths: readonly string[],
  options: { readonly description: string },
): Layer {
  if (name.length === 0) {
    throw new Error('Layer name must not be empty');
  }
  if (paths.length === 0) {
    throw new Error(`Layer "${name}" must have at least 1 path`);
  }
  const normalizedPaths = paths.map(normalizeConfigPath);
  if (new Set(normalizedPaths).size !== normalizedPaths.length) {
    throw new Error(`Layer "${name}" contains duplicate paths`);
  }
  return {
    kind: 'layer',
    name,
    paths: normalizedPaths,
    description: options.description,
  };
}
