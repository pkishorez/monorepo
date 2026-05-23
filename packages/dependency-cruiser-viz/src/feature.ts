import type { Feature, FeatureConfig } from './types.js';

export function feature(
  name: string,
  paths: string[],
  config?: FeatureConfig,
): Feature {
  if (name.length === 0) {
    throw new Error('Feature name must not be empty');
  }
  if (paths.length === 0) {
    throw new Error(`Feature "${name}" must have at least one path`);
  }
  return { kind: 'feature', name, paths, config: config ?? {} };
}
