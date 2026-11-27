import { basename } from 'node:path';

import { Effect } from 'effect';

import {
  NoPackageJsonError,
  WorkspaceReadError,
} from '../../contract/index.js';
import type { Snapshot } from '../../../../services/snapshots/contract/index.js';
import {
  analyzeMonorepo as analyzeMonorepoEngine,
  type AnalyzeMonorepoError,
} from './engine.js';

export function analyzeMonorepo(
  snapshot: Snapshot,
  files: ReadonlyArray<string>,
) {
  return analyzeMonorepoEngine(snapshot, files).pipe(
    Effect.mapError(toRpcError),
  );
}

function toRpcError(error: AnalyzeMonorepoError) {
  switch (error._tag) {
    case 'MonorepoReadError':
      if (error.reason === 'no-package-json') {
        return new NoPackageJsonError({ path: error.path });
      }
      return new WorkspaceReadError({
        reason: error.reason,
        path: error.path,
        message:
          error.reason === 'workspace-parse'
            ? `Could not read the workspace globs from ${basename(error.path)}.`
            : 'Could not match the workspace globs.',
      });
    case 'ManifestError':
      return new WorkspaceReadError({
        reason: error.reason === 'read' ? 'manifest-read' : 'manifest-parse',
        path: error.path,
        message:
          error.reason === 'read'
            ? 'Could not read a Package manifest.'
            : 'A Package manifest is not valid JSON.',
      });
  }
}
