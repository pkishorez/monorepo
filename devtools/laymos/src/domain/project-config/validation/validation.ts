import type { Config, ConfigValidationIssue } from '../project-config.js';
import { validateLayers } from './layers/index.js';
import { validateModules } from './modules/index.js';
import { findInvalidPaths } from './paths.js';

export function validateProjectConfig(
  config: Config,
): readonly ConfigValidationIssue[] {
  const pathIssues = findInvalidPaths(config);
  const moduleIssues = validateModules(config);
  const modulePathIssues = moduleIssues.filter(({ kind }) => kind === 'path');
  if (pathIssues.length > 0 || modulePathIssues.length > 0) {
    return [...pathIssues, ...modulePathIssues];
  }
  return [...validateLayers(config), ...moduleIssues];
}
