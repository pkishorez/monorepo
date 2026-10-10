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
import { detectPackageManager } from './package-manager/index.js';
import { InvalidMonorepoPath } from './errors.js';

export type AnalyzeMonorepoError =
  | InvalidMonorepoPath
  | MonorepoReadError
  | ManifestError;

/**
 * Given an absolute folder, returns its analysis as a Monorepo or a Single
 * Package: its Package Manager, every Package, their dependencies on each
 * other by name, and any cycles. A Single Package has one Package, its root.
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
    const packageManager = yield* detectPackageManager(root);
    const graph = buildPackageGraph(monorepo.manifests);
    return {
      kind: monorepo.kind,
      name: monorepo.name,
      path: root,
      packageManager,
      packages: graph.packages,
      violations: graph.violations,
    };
  }).pipe(Effect.provide(NodeServices.layer));
}
