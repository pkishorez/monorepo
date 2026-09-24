import { homedir } from 'node:os';
import { join } from 'node:path';

import { Effect } from 'effect';
import {
  GitError,
  loadFolderFiles,
  SourceFileReadError as LaymosSourceFileReadError,
} from 'laymos';

import { GitUnavailableError, PackageFileReadError } from '../../rpc/index.js';

/**
 * Fulfils `GetPackageFiles`: reads the Package files of one Package. Git lists
 * only paths inside the Monorepo, and only those beneath the Package folder
 * are kept, so no file outside the Package is ever read.
 */
export function getPackageFiles(monorepoRoot: string, packagePath: string) {
  return loadFolderFiles(expandHome(monorepoRoot), [packagePath]).pipe(
    Effect.mapError((cause) =>
      cause instanceof LaymosSourceFileReadError
        ? new PackageFileReadError({
            path: cause.filePath,
            message: 'Could not read the file.',
          })
        : new GitUnavailableError({
            reason: cause instanceof GitError ? cause.reason : 'command-failed',
          }),
    ),
  );
}

function expandHome(path: string): string {
  if (path === '~') return homedir();
  return path.startsWith('~/') ? join(homedir(), path.slice(2)) : path;
}
