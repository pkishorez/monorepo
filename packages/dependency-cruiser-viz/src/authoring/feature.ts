import type { Feature, FeatureConfig } from '../types.js';

export function feature(name: string, config?: FeatureConfig): Feature {
  if (name.length === 0) {
    throw new Error('Feature name must not be empty');
  }
  return { kind: 'feature', name, config: config ?? {} };
}
