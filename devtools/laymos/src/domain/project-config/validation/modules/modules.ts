import type { Config, ConfigValidationIssue } from '../../project-config.js';
import { resolveConfig } from '../../resolve.js';
import { findModuleGraphIssues } from './graphs.js';
import { findModuleOverlaps } from './overlaps.js';
import { findModulePathIssues } from './paths.js';
import { findScopeIssues } from './scopes.js';

export function validateModules(
  config: Config,
): readonly ConfigValidationIssue[] {
  const pathIssues = findModulePathIssues(config);
  if (pathIssues.length > 0) return pathIssues;
  const resolved = resolveConfig(config);
  return [
    ...findModuleOverlaps(resolved),
    ...findScopeIssues(config, resolved),
    ...findModuleGraphIssues(config, resolved),
  ];
}
