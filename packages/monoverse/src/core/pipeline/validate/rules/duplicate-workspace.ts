import { Effect } from 'effect';
import type { ProjectAnalysis } from '../../analyze/types.js';
import type { BaseViolation } from './base.js';
import { toRelativePath } from '../../../primitives/fs/index.js';

export interface ViolationDuplicateWorkspace extends BaseViolation {
  _tag: 'ViolationDuplicateWorkspace';
  paths: string[];
}

export function detectDuplicateWorkspaces(
  analysis: ProjectAnalysis,
): Effect.Effect<ViolationDuplicateWorkspace[]> {
  return Effect.sync(() => {
    const violations: ViolationDuplicateWorkspace[] = [];
    const workspacesByName = new Map<string, string[]>();

    for (const workspace of analysis.workspaces) {
      const paths = workspacesByName.get(workspace.name) ?? [];
      const relativePath = toRelativePath(workspace.path, analysis.root);
      paths.push(relativePath);
      workspacesByName.set(workspace.name, paths);
    }

    for (const [name, paths] of workspacesByName) {
      if (paths.length > 1) {
        violations.push({
          _tag: 'ViolationDuplicateWorkspace',
          package: name,
          workspace: name,
          message: `Duplicate workspace name "${name}" found in ${paths.length} locations`,
          paths,
        });
      }
    }

    return violations;
  });
}
