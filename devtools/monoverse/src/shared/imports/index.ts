import {
  type Tree,
  isIndexFile,
  isInside,
  moduleOf,
  ownerThrough,
  parentOf,
  relativeTo,
} from '../tree/index.ts';

/*
 * The imports rule: a file may import
 *
 *   1. any file in its own module;
 *   2. below it, the index file of any module, at any depth;
 *   3. beside or above it, a door: the index file of a door folder, or of
 *      a folder directly inside one, that its own folder or a folder above
 *      it owns.
 *
 * Nothing else. A file outside the importer's package, or in a package
 * nested inside it, is never judged. Paths are relative to the project
 * root.
 */

/** The imports rule's settings. */
export interface ImportsRule {
  /** Door folders, as paths from the folder that owns them: `logic/shared`, `services/*\/contract`. */
  readonly doors: readonly string[];
}

/** Whether one import keeps the imports rule, and if not, why. */
export type ImportVerdict =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason: 'inside';
      /** The module reached into, whose index file to import instead. */
      readonly module: string;
    }
  | {
      readonly ok: false;
      readonly reason: 'door';
      /** The doors that could have been used. */
      readonly doors: readonly string[];
    };

/** Whether `importer` may import `target`, two files the Tree holds. */
export const judgeImport = (
  tree: Tree,
  rule: ImportsRule,
  importer: string,
  target: string,
): ImportVerdict => {
  const root = tree.packageOf(parentOf(importer));
  if (!isInside(target, root) || tree.packageOf(parentOf(target)) !== root)
    return { ok: true };
  const own = moduleOf(tree, parentOf(importer), root);
  const targetModule = moduleOf(tree, parentOf(target), root);
  if (targetModule === own) return { ok: true };

  if (isInside(target, own))
    return isIndexFile(target)
      ? { ok: true }
      : { ok: false, reason: 'inside', module: targetModule };

  if (
    isIndexFile(target) &&
    isDoorIndex(importer, parentOf(target), rule, root)
  )
    return { ok: true };
  return { ok: false, reason: 'door', doors: rule.doors };
};

/**
 * Whether `dir` is a door, or a folder directly in one, that a folder
 * holding `importer` owns: the package `root` or a folder inside it.
 */
const isDoorIndex = (
  importer: string,
  dir: string,
  rule: ImportsRule,
  root: string,
): boolean =>
  [dir, parentOf(dir)].some((folder) =>
    rule.doors.some((door) => {
      const owner = ownerThrough(folder, door);
      return (
        owner !== undefined &&
        (owner === root || isInside(owner, root)) &&
        isInside(importer, owner)
      );
    }),
  );

/**
 * What a broken import is told, and how to fix it. `what` names the
 * import as the reader knows it: the specifier as written, or a path.
 * `root` is the package, so the module is named from it.
 */
export const importMessage = (
  verdict: Exclude<ImportVerdict, { readonly ok: true }>,
  what: string,
  root: string,
): string => {
  if (verdict.reason === 'inside') {
    const module = relativeTo(root, verdict.module);
    return `'${what}' reaches inside ${module}. Import ${module} through its index file, and export what you need from there.`;
  }
  return verdict.doors.length === 0
    ? `'${what}' is beside or above this file, and this package has no doors. Move what you need below the files that use it.`
    : `'${what}' is beside or above this file and is not a door. Import a door's index file (${verdict.doors.join(', ')}), or move what you need into one.`;
};
