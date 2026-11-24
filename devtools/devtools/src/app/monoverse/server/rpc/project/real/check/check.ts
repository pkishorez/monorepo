import {
  configFile,
  contractFindings,
  importMessage,
  importsIn,
  isChecked,
  judgeImport,
  listTree,
  parseConfig,
  relativeTo,
  resolveRelative,
  type Config,
} from '@kestack/monoverse';

import { parentOf } from '../../../contract/index.js';
import type { Snapshot } from '../../../../services/snapshots/contract/index.js';
import type { Check, Violation } from '../../contract/index.js';
import type { Reader } from '../file-graph/file-graph.js';
import { joinPath, readText } from '../read-text.js';

/*
 * A Package checked the way `vp lint` checks it, by @kestack/monoverse:
 * only with a monoverse.json beside its package.json, only the files its
 * Source roots hold and its ignore globs leave, each import statement
 * resolved and judged as the lint judges it, and each contract read as
 * the lint reads it. A Package nested inside it has its own
 * monoverse.json, or none.
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

/** A Package's check under way: what it reads of each parsed file, and what it found. */
export interface PackageCheck {
  /** Hands the check the files it reads; none when nothing is checked. */
  readonly reader: Reader | undefined;
  readonly check: () => Check;
}

/**
 * Starts checking the Package at `base`, relative to the root, whose
 * files git knows are `files`: the check reads each file it wants as the
 * graph parses it, and tells what it found once all are read.
 */
export function startCheck(
  settings: Settings,
  base: string,
  files: ReadonlyArray<string>,
): PackageCheck {
  if (settings._tag === 'None')
    return { reader: undefined, check: () => ({ _tag: 'Unchecked' }) };
  if (settings._tag === 'Invalid') {
    const { message } = settings;
    return { reader: undefined, check: () => ({ _tag: 'Invalid', message }) };
  }
  const { config } = settings;
  const tree = listTree(files);
  const known = new Set(files);
  const exists = (path: string) => known.has(path);
  const violations: Array<Violation> = [];
  const reader: Reader = {
    wants: (path) =>
      tree.packageOf(parentOf(path)) === base &&
      isChecked(config, relativeTo(base, path)),
    read: (from, program) => {
      const resolve = (specifier: string) =>
        resolveRelative(from, specifier, exists);
      const imports = config.rules.imports;
      if (imports)
        for (const { specifier } of importsIn(program)) {
          const to = resolve(specifier);
          if (to === undefined) continue;
          const verdict = judgeImport(tree, imports, from, to);
          if (verdict.ok) continue;
          violations.push({
            from,
            to,
            reason: verdict.reason,
            message: importMessage(verdict, specifier, base),
          });
        }
      const contracts = config.rules.contracts;
      if (contracts)
        for (const { message } of contractFindings(
          tree,
          contracts,
          from,
          base,
          program,
          resolve,
        ))
          violations.push({ from, reason: 'contract', message });
    },
  };
  return {
    reader,
    check: () => ({
      _tag: 'Checked',
      violations: [...violations].sort((a, b) => a.from.localeCompare(b.from)),
    }),
  };
}
