import { posix } from 'node:path';

import { Effect } from 'effect';

import { isWithin, rootRelative } from '../../../contract/index.js';
import type { Snapshot } from '../../../../services/snapshots/contract/index.js';
import { joinPath, readText } from '../read-text.js';

/** The file beside a Package's package.json that may name its Source roots. */
export const configName = 'laymos.config.json';

/**
 * A Package's Source roots at a branch, relative to the root: the `sourceRoots` of the
 * `laymos.config.json` beside its package.json, each inside the Package.
 * Nothing else in that file is read. Without the file, or without a usable
 * `sourceRoots` in it, the whole Package is one Source root.
 */
export function readSourceRoots(
  snapshot: Snapshot,
  packagePath: string,
): Effect.Effect<ReadonlyArray<string>> {
  const base = rootRelative(packagePath);
  const whole = [base];
  return Effect.promise(async () => {
    const text = await readText(snapshot, joinPath(base, configName)).catch(
      () => undefined,
    );
    if (text === undefined) return whole;
    const named = sourceRootsIn(text);
    if (named === undefined) return whole;
    const roots = named
      .map((entry) => rootRelative(posix.normalize(posix.join(base, entry))))
      .map((entry) => entry.replace(/\/$/, ''))
      .filter((entry) => isWithin(entry, base) && !entry.startsWith('..'));
    return roots.length === 0 ? whole : [...new Set(roots)];
  });
}

function sourceRootsIn(text: string): ReadonlyArray<string> | undefined {
  try {
    const json = JSON.parse(text) as unknown;
    if (typeof json !== 'object' || json === null) return undefined;
    const roots = (json as { sourceRoots?: unknown }).sourceRoots;
    if (!Array.isArray(roots)) return undefined;
    return roots.filter((entry): entry is string => typeof entry === 'string');
  } catch {
    return undefined;
  }
}
