import {
  checkImport,
  configFile,
  importMessage,
  listTree,
  parseConfig,
  relativeTo,
  type Config,
} from '@kestack/monoverse';

import { parentOf } from '../../../contract/index.js';
import type { Snapshot } from '../../../../services/snapshots/contract/index.js';
import type { Check, Import, Violation } from '../../contract/index.js';
import { joinPath, readText } from '../read-text.js';

/*
 * A Package checked the way `vp lint` checks it, by @kestack/monoverse:
 * only with a monoverse.json beside its package.json, only the files its
 * Source roots hold and its ignore globs leave, and only the imports
 * between files of the Package itself. A Package nested inside it has its
 * own monoverse.json, or none.
 */

/** A Package's monoverse.json at a branch: none, one that cannot be read, or its settings. */
export type Settings =
  | { readonly _tag: 'None' }
  | { readonly _tag: 'Invalid'; readonly message: string }
  | { readonly _tag: 'Read'; readonly config: Config };

/**
 * Reads the monoverse.json of the Package at `base`, relative to the
 * root, from `files`, every file git knows in it.
 */
export async function readSettings(
  snapshot: Snapshot,
  files: ReadonlyArray<string>,
  base: string,
): Promise<Settings> {
  const path = joinPath(base, configFile);
  if (!files.includes(path)) return { _tag: 'None' };
  const text = await readText(snapshot, path);
  if (text === undefined) return { _tag: 'None' };
  const read = parseConfig(text);
  return read.ok
    ? { _tag: 'Read', config: read.config }
    : { _tag: 'Invalid', message: read.error };
}

/**
 * The Package's Source roots, relative to the root: its monoverse.json's,
 * or the whole Package without one that can be read.
 */
export function sourceRootsOf(
  settings: Settings,
  base: string,
): ReadonlyArray<string> {
  if (settings._tag !== 'Read') return [base];
  return settings.config.sourceRoots.map((root) =>
    root === '' ? base : joinPath(base, root),
  );
}

/** What the settings make of the Package's imports, `[from, to]` relative to the root. */
export function checkOf(
  settings: Settings,
  base: string,
  files: ReadonlyArray<string>,
  imports: ReadonlyArray<Import>,
): Check {
  if (settings._tag === 'None') return { _tag: 'Unchecked' };
  if (settings._tag === 'Invalid')
    return { _tag: 'Invalid', message: settings.message };
  const tree = listTree(files);
  const violations: Array<Violation> = [];
  for (const [from, to] of imports) {
    if (tree.packageOf(parentOf(from)) !== base) continue;
    const verdict = checkImport(tree, settings.config, from, to);
    if (verdict.ok) continue;
    violations.push({
      from,
      to,
      reason: verdict.reason,
      message: importMessage(verdict, relativeTo(base, to), base),
    });
  }
  return { _tag: 'Checked', violations };
}
