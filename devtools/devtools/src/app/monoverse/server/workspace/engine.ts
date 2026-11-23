import { Effect } from 'effect';

import type { Workspace } from '../../contract/index.js';
import type { Snapshot } from '../snapshot/index.js';
import {
  loadMonorepo,
  type ManifestError,
  type MonorepoReadError,
} from './monorepo/index.js';
import { buildPackageGraph } from './package-graph/index.js';
import { detectPackageManager } from './package-manager/index.js';

/** A Workspace before its files are listed. */
export type WorkspaceAnalysis = Omit<Workspace, 'files'>;

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
