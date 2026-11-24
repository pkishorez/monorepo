import { Effect } from 'effect';

import type { Snapshot } from '../../../../../services/snapshots/contract/index.js';
import type { PackageManager } from '../../../contract/index.js';
import { readText } from '../../read-text.js';
import { declaredPackageManager } from './declared.js';
import { lockfileNames } from './lockfiles.js';

/**
 * The Package Manager of a Project at a branch, by the first rule that
 * holds: `pnpm-workspace.yaml` is present (pnpm); the root `package.json`
 * `packageManager` field names one (`"yarn@4.5.0"`); a lockfile names one;
 * otherwise npm. Never fails: an unreadable file is a rule that does not hold.
 */
export function detectPackageManager(
  snapshot: Snapshot,
  files: ReadonlyArray<string>,
): Effect.Effect<PackageManager> {
  return Effect.gen(function* () {
    // Only the root's own files count, and the lockfiles are never read.
    const present = new Set(files.filter((path) => !path.includes('/')));
    if (present.has('pnpm-workspace.yaml')) return 'pnpm';

    const manifest = yield* Effect.tryPromise(() =>
      readText(snapshot, 'package.json'),
    ).pipe(Effect.orElseSucceed(() => undefined));
    const declared = declaredPackageManager(manifest);
    if (declared !== undefined) return declared;

    for (const [name, packageManager] of lockfileNames) {
      if (present.has(name)) return packageManager;
    }
    return 'npm';
  });
}
