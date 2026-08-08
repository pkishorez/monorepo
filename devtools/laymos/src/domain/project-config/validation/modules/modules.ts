import type { Config, ConfigValidationIssue } from '../../project-config.js';
import { findContainmentIssues } from './containment.js';
import { findNestedIssues } from './nested.js';
import { findModuleOverlaps } from './overlaps.js';
import { findModulePathIssues } from './paths.js';

export function validateModules(
  config: Config,
): readonly ConfigValidationIssue[] {
  const pathIssues = findModulePathIssues(config.modules);
  if (pathIssues.length > 0) return pathIssues;
  return [
    ...findModuleOverlaps(config.modules),
    ...findContainmentIssues(config),
    ...findNestedIssues(config),
  ];
}
