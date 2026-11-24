import { readFileSync, statSync } from 'node:fs';
import { sep } from 'node:path';
import {
  type Config,
  configFile,
  isChecked,
  parseConfig,
} from '../shared/config/index.ts';
import {
  type Tree,
  diskTree,
  joinPath,
  parentOf,
  relativeTo,
} from '../shared/tree/index.ts';

/*
 * What the lint knows about the file it is on: its package, and that
 * package's `monoverse.json`. The file is read again whenever it changes,
 * since an editor keeps one lint running for hours.
 */

/** How the rules treat one file. */
export type Settings =
  /** Its package has no `monoverse.json`, or does not check this file. */
  | { readonly kind: 'off' }
  /** Its package's `monoverse.json` is broken. */
  | { readonly kind: 'invalid'; readonly error: string }
  /** The rules check it. */
  | {
      readonly kind: 'on';
      readonly file: string;
      readonly root: string;
      readonly config: Config;
      readonly tree: Tree;
    };

const tree = diskTree();

const read = new Map<
  string,
  {
    readonly changed: number;
    readonly result: ReturnType<typeof parseConfig>;
  }
>();

/** The settings for `filename`, as oxlint names it. */
export const settingsOf = (filename: string): Settings => {
  const file = sep === '/' ? filename : filename.split(sep).join('/');
  const root = tree.packageOf(parentOf(file));
  const path = joinPath(root, configFile);
  const stat = statSync(path, { throwIfNoEntry: false });
  if (!stat) {
    read.delete(path);
    return { kind: 'off' };
  }
  let known = read.get(path);
  if (known === undefined || known.changed !== stat.mtimeMs) {
    known = {
      changed: stat.mtimeMs,
      result: parseConfig(readFileSync(path, 'utf8')),
    };
    read.set(path, known);
  }
  const { result } = known;
  if (!result.ok) return { kind: 'invalid', error: result.error };
  if (!isChecked(result.config, relativeTo(root, file))) return { kind: 'off' };
  return { kind: 'on', file, root, config: result.config, tree };
};
