import {
  type Tree,
  isIndexFile,
  isInside,
  moduleOf,
  ownerThrough,
  parentOf,
  relativeTo,
} from '../tree/index.ts';

export interface ImportsRule {
  readonly doors: readonly string[];
}

export type ImportVerdict =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason: 'inside';
      readonly module: string;
    }
  | {
      readonly ok: false;
      readonly reason: 'door';
      readonly doors: readonly string[];
    };

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
