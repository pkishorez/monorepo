import { Effect } from 'effect';
import type { DependencyType, ProjectAnalysis } from '../../analyze/types.js';
import type { BaseViolation } from './base.js';
import { groupDependenciesByPackage } from '../group-by-package.js';
import { isPinnedVersion } from '../../../primitives/semver/index.js';

export interface ViolationUnpinnedVersion extends BaseViolation {
  _tag: 'ViolationUnpinnedVersion';
  versionRange: string;
  dependencyType: DependencyType;
}

export function detectUnpinnedVersions(
  analysis: ProjectAnalysis,
): Effect.Effect<ViolationUnpinnedVersion[]> {
  return Effect.sync(() => {
    const violations: ViolationUnpinnedVersion[] = [];
    const dependenciesByPackage = groupDependenciesByPackage(analysis, ['npm']);

    for (const dep of dependenciesByPackage) {
      for (const instance of dep.instances) {
        if (instance.type === 'peerDependency') continue;
        if (!isPinnedVersion(instance.versionRange)) {
          violations.push({
            _tag: 'ViolationUnpinnedVersion',
            package: dep.name,
            workspace: instance.workspace,
            message: `Version range "${instance.versionRange}" is not pinned`,
            versionRange: instance.versionRange,
            dependencyType: instance.type,
          });
        }
      }
    }

    return violations;
  });
}
