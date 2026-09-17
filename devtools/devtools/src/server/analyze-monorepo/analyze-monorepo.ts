import { homedir } from 'node:os';
import { join } from 'node:path';

import { Effect } from 'effect';
import {
  analyzeMonorepo as analyzeMonorepoEngine,
  type AnalyzeMonorepoError,
} from './engine.js';
import {
  InvalidMonorepoPathError,
  MonorepoReadFailure,
  NotPnpmWorkspaceError,
} from '../../rpc/index.js';

/** Fulfils `AnalyzeMonorepo`: expands `~`, runs the engine, maps its errors. */
export function analyzeMonorepo(monorepoPath: string) {
  return analyzeMonorepoEngine(expandHome(monorepoPath)).pipe(
    Effect.mapError(toRpcError),
  );
}

function expandHome(path: string): string {
  if (path === '~') return homedir();
  return path.startsWith('~/') ? join(homedir(), path.slice(2)) : path;
}

function toRpcError(error: AnalyzeMonorepoError) {
  switch (error._tag) {
    case 'InvalidMonorepoPath':
      return new InvalidMonorepoPathError({
        reason: error.reason,
        path: error.path,
      });
    case 'MonorepoReadError':
      if (error.reason === 'not-a-workspace') {
        return new NotPnpmWorkspaceError({ path: error.path });
      }
      return new MonorepoReadFailure({
        reason: error.reason,
        path: error.path,
        message:
          error.reason === 'workspace-parse'
            ? 'Could not parse pnpm-workspace.yaml.'
            : 'Could not match the workspace globs.',
      });
    case 'ManifestError':
      return new MonorepoReadFailure({
        reason: error.reason === 'read' ? 'manifest-read' : 'manifest-parse',
        path: error.path,
        message:
          error.reason === 'read'
            ? 'Could not read a Package manifest.'
            : 'A Package manifest is not valid JSON.',
      });
  }
}
