import { join } from 'node:path';

import { Effect, FileSystem } from 'effect';

import type { PackageManager } from '../../../rpc/index.js';
import { declaredPackageManager } from './declared.js';
import { lockfileNames } from './lockfiles.js';

/**
 * The Package Manager of the Monorepo at `root`, by the first rule that
 * holds: `pnpm-workspace.yaml` is present (pnpm); the root `package.json`
 * `packageManager` field names one (`"yarn@4.5.0"`); a lockfile names one;
 * otherwise npm. Never fails: an unreadable file is a rule that does not hold.
 */
export function detectPackageManager(
  root: string,
): Effect.Effect<PackageManager, never, FileSystem.FileSystem> {
  return Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const exists = (name: string) =>
      fileSystem
        .exists(join(root, name))
        .pipe(Effect.orElseSucceed(() => false));

    if (yield* exists('pnpm-workspace.yaml')) return 'pnpm';

    const manifest = yield* fileSystem
      .readFileString(join(root, 'package.json'))
      .pipe(Effect.orElseSucceed(() => undefined));
    const declared = declaredPackageManager(manifest);
    if (declared !== undefined) return declared;

    for (const [name, packageManager] of lockfileNames) {
      if (yield* exists(name)) return packageManager;
    }
    return 'npm';
  });
}
