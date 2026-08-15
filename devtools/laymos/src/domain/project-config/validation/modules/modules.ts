import type { Config, ConfigValidationIssue } from '../../project-config.js';
import { findContainmentIssues } from './containment.js';
import { findAllSharedLayerIssues } from './kinds.js';
import { findModuleOverlaps } from './overlaps.js';
import { findModulePathIssues } from './paths.js';
import { findSubpathIssues } from './subpaths.js';

export function validateModules(
  config: Config,
): readonly ConfigValidationIssue[] {
  const pathIssues = findModulePathIssues(config.modules);
  if (pathIssues.length > 0) return pathIssues;
  return [
    ...findModuleOverlaps(config.modules),
    ...findContainmentIssues(config),
    ...findSubpathIssues(config),
    ...findAllSharedLayerIssues(config),
  ];
}
