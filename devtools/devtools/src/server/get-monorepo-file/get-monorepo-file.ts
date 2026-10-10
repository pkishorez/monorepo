import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join, normalize, relative, resolve, sep } from 'node:path';

import { Effect } from 'effect';
import {
  MonorepoFileNotFoundError,
  MonorepoFileOutsideError,
  MonorepoFileReadError,
} from '../../rpc/index.js';

// Git's own test for binary content: a NUL byte near the start.
const binarySniffLength = 8000;

/**
 * Fulfils `GetMonorepoFile`: reads one file of a Monorepo, such as one of a
 * Package's files, by its Monorepo-relative path. The path may never leave
 * the Monorepo; a binary file comes back without its bytes.
 */
export function getMonorepoFile(monorepoRoot: string, path: string) {
  return Effect.gen(function* () {
    const root = resolve(expandHome(monorepoRoot));
    const file = resolve(root, path);
    const inside = relative(root, file);
    if (
      isAbsolute(path) ||
      inside === '' ||
      inside === '..' ||
      inside.startsWith(`..${sep}`)
    ) {
      return yield* new MonorepoFileOutsideError({ path });
    }

    const normalized = normalize(inside).split(sep).join('/');
    const bytes = yield* Effect.tryPromise({
      try: () => readFile(file),
      catch: (cause) =>
        isMissingFile(cause)
          ? new MonorepoFileNotFoundError({ path: normalized })
          : new MonorepoFileReadError({
              path: normalized,
              message: 'Could not read the file.',
            }),
    });
    const binary = bytes.subarray(0, binarySniffLength).includes(0);
    return {
      path: normalized,
      content: binary ? '' : new TextDecoder().decode(bytes),
      ...(binary ? { binary } : {}),
    };
  });
}

function isMissingFile(cause: unknown): boolean {
  return (
    typeof cause === 'object' &&
    cause !== null &&
    'code' in cause &&
    (cause.code === 'ENOENT' ||
      cause.code === 'ENOTDIR' ||
      cause.code === 'EISDIR')
  );
}

function expandHome(path: string): string {
  if (path === '~') return homedir();
  return path.startsWith('~/') ? join(homedir(), path.slice(2)) : path;
}
