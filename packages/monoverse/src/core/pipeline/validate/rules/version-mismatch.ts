import { Effect } from 'effect';
import type { DependencyType, ProjectAnalysis } from '../../analyze/types.js';
import type { BaseViolation } from './base.js';
import { groupDependenciesByPackage } from '../group-by-package.js';

export interface ViolationVersionMismatch extends BaseViolation {
  _tag: 'ViolationVersionMismatch';
  versionRange: string;
  dependencyType: DependencyType;
  allVersions: string[];
}

export function detectVersionMismatches(
  analysis: ProjectAnalysis,
): Effect.Effect<ViolationVersionMismatch[]> {
  return Effect.sync(() => {
    const violations: ViolationVersionMismatch[] = [];
    const dependenciesByPackage = groupDependenciesByPackage(analysis, ['npm']);

    for (const dep of dependenciesByPackage) {
      const instances = dep.instances.filter((i) => i.type !== 'peerDependency');
      if (instances.length < 2) continue;

      const versions = new Set(instances.map((i) => i.versionRange));
      if (versions.size === 1) continue;

      const versionList = Array.from(versions).join(', ');
      const allVersions = Array.from(versions);
      for (const instance of instances) {
        violations.push({
          _tag: 'ViolationVersionMismatch',
          package: dep.name,
          workspace: instance.workspace,
          message: `Multiple versions found: ${versionList}`,
          versionRange: instance.versionRange,
          dependencyType: instance.type,
          allVersions,
        });
      }
    }

    return violations;
  });
}
