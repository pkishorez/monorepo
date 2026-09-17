import { isAbsolute, resolve } from 'node:path';

import { NodeServices } from '@effect/platform-node';
import { Effect, FileSystem } from 'effect';

import { buildPackageGraph } from './package-graph/index.js';
import type { MonorepoAnalysis } from '../../rpc/index.js';
import {
  loadMonorepo,
  type ManifestError,
  type MonorepoReadError,
} from './monorepo/index.js';
import { InvalidMonorepoPath } from './errors.js';

export type AnalyzeMonorepoError =
  | InvalidMonorepoPath
  | MonorepoReadError
  | ManifestError;

/**
 * Given an absolute Monorepo root, returns its Monorepo analysis: every
 * Package, their dependencies on each other by name, and any cycles.
 */
export function analyzeMonorepo(
  monorepoPath: string,
): Effect.Effect<MonorepoAnalysis, AnalyzeMonorepoError> {
  return Effect.gen(function* () {
    if (!isAbsolute(monorepoPath)) {
      return yield* new InvalidMonorepoPath({
        reason: 'relative',
        path: monorepoPath,
      });
    }
    const root = resolve(monorepoPath);
    const fileSystem = yield* FileSystem.FileSystem;
    const info = yield* fileSystem
      .stat(root)
      .pipe(
        Effect.mapError(
          () => new InvalidMonorepoPath({ reason: 'not-found', path: root }),
        ),
      );
    if (info.type !== 'Directory') {
      return yield* new InvalidMonorepoPath({
        reason: 'not-directory',
        path: root,
      });
    }
    const monorepo = yield* loadMonorepo(root);
    const graph = buildPackageGraph(monorepo.manifests);
    return {
      name: monorepo.name,
      path: root,
      packages: graph.packages,
      violations: graph.violations,
    };
  }).pipe(Effect.provide(NodeServices.layer));
}
