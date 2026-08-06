import type { Config } from '../config.js';
import type { ConfigValidationIssue } from '../errors.js';
import { validateLayers } from './layers/index.js';
import { findInvalidPaths } from './paths.js';

export function validateConfig(
  config: Config,
): readonly ConfigValidationIssue[] {
  return [...findInvalidPaths(config), ...validateLayers(config)];
}
