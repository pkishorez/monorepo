import { Effect } from 'effect';
import sortPackageJson from 'sort-package-json';
import type { ProjectAnalysis } from '../../analyze/types.js';
import { getPackageJsonStr } from '../../analyze/index.js';
import type { BaseViolation } from './base.js';

export interface ViolationFormatPackageJson extends BaseViolation {
  _tag: 'ViolationFormatPackageJson';
}

export function detectFormatPackageJson(
  analysis: ProjectAnalysis,
): Effect.Effect<ViolationFormatPackageJson[]> {
  return Effect.gen(function* () {
    const violations: ViolationFormatPackageJson[] = [];

    for (const workspace of analysis.workspaces) {
      const content = yield* getPackageJsonStr(workspace).pipe(
        Effect.catchAll(() => Effect.succeed(null)),
      );
      if (content === null) continue;

      const sorted = sortPackageJson(content);
      if (content !== sorted) {
        violations.push({
          _tag: 'ViolationFormatPackageJson',
          package: workspace.name,
          workspace: workspace.name,
          message: 'package.json is not sorted',
        });
      }
    }

    return violations;
  });
}
