import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join, normalize, relative, resolve, sep } from 'node:path';

import { Effect } from 'effect';
import {
  PackageReadmeNotFoundError,
  PackageReadmeOutsidePackageError,
  PackageReadmeReadError,
} from '../../rpc/index.js';

/**
 * Fulfils `GetPackageReadme`: reads one markdown file inside a Package folder.
 * `relativePath` defaults to the Package's `README.md` and may never leave
 * the Package folder.
 */
export function getPackageReadme(
  monorepoRoot: string,
  packagePath: string,
  relativePath = 'README.md',
) {
  return Effect.gen(function* () {
    const packageDir = resolve(expandHome(monorepoRoot), packagePath);
    const file = resolve(packageDir, relativePath);
    const inside = relative(packageDir, file);
    if (
      isAbsolute(relativePath) ||
      inside === '' ||
      inside === '..' ||
      inside.startsWith(`..${sep}`)
    ) {
      return yield* new PackageReadmeOutsidePackageError({ relativePath });
    }

    const path = normalize(inside).split(sep).join('/');
    const markdown = yield* Effect.tryPromise({
      try: () => readFile(file, 'utf8'),
      catch: (cause) =>
        isMissingFile(cause)
          ? new PackageReadmeNotFoundError({ path })
          : new PackageReadmeReadError({
              path,
              message: 'Could not read the markdown file.',
            }),
    });
    return { path, markdown };
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
