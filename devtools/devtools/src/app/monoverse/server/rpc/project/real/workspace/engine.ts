import { Effect } from 'effect';

import type { Snapshot } from '../../../../services/snapshots/contract/index.js';
import type { Workspace } from '../../contract/index.js';
import type { MonorepoReadError } from './monorepo/errors.js';
import { loadMonorepo } from './monorepo/monorepo.js';
import type { ManifestError } from './package/errors.js';
import {
  buildPackageGraph,
  type GraphPackage,
} from './package-graph/package-graph.js';
import { detectPackageManager } from './package-manager/package-manager.js';

/** A Workspace before its files are listed and its Packages checked. */
export type WorkspaceAnalysis = Omit<Workspace, 'files' | 'packages'> & {
  readonly packages: ReadonlyArray<GraphPackage>;
};

export type AnalyzeMonorepoError = MonorepoReadError | ManifestError;

/**
 * Reads a Project at a branch as a Monorepo or a Single Package: its
 * Package Manager, every Package, their dependencies on each other by name,
 * and any cycles. A Single Package has one Package, its root. `files` are
 * every file of the snapshot, which the workspace globs are matched on.
 */
export function analyzeMonorepo(
  snapshot: Snapshot,
  files: ReadonlyArray<string>,
): Effect.Effect<WorkspaceAnalysis, AnalyzeMonorepoError> {
  return Effect.gen(function* () {
    const monorepo = yield* loadMonorepo(snapshot, files);
    const packageManager = yield* detectPackageManager(snapshot, files);
    const graph = buildPackageGraph(monorepo.manifests);
    return {
      kind: monorepo.kind,
      name: monorepo.name,
      path: snapshot.root,
      packageManager,
      packages: graph.packages,
      cycles: graph.cycles,
    };
  });
}
