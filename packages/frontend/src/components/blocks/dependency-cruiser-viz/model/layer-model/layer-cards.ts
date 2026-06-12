import type { ModuleNode } from '../modules';

/**
 * A module rendered as a chip. `children` are modules whose name nests under
 * this module's name (true module containment, e.g. `otel` ⊃ `otel/internal`)
 * — never folder structure.
 */
export type ModuleChip = {
  module: ModuleNode;
  /** Display label: name relative to the folder group or parent module. */
  label: string;
  /** Declared in `config.modules` (vs discovered from coverage). */
  declared: boolean;
  children: ModuleChip[];
};

/**
 * Top-level modules of a layer clustered by their parent folder (the dirname
 * of the layer-relative module name). `folder` is null for layer-root modules.
 */
export type ChipGroup = {
  folder: string | null;
  chips: ModuleChip[];
};

/**
 * Turns a layer's flat module list into render-ready chip groups:
 * containment forest (module name prefix ⇒ child chip), roots clustered by
 * parent folder. Within a group declared chips precede discovered ones (each
 * alphabetical) so an overflow cap can always keep declared modules visible.
 */
export function buildLayerCardGroups(
  modules: ModuleNode[],
  declaredKeys: ReadonlySet<string>,
): ChipGroup[] {
  const sorted = [...modules].sort((a, b) => a.name.localeCompare(b.name));

  const roots: ModuleChip[] = [];
  const placed: Array<{ name: string; chip: ModuleChip }> = [];

  for (const mod of sorted) {
    const chip: ModuleChip = {
      module: mod,
      label: mod.name === '' ? '(root)' : mod.name,
      declared: declaredKeys.has(mod.key),
      children: [],
    };

    let parent: { name: string; chip: ModuleChip } | null = null;
    for (const candidate of placed) {
      if (
        candidate.name !== '' &&
        mod.name.startsWith(candidate.name + '/') &&
        (!parent || candidate.name.length > parent.name.length)
      ) {
        parent = candidate;
      }
    }

    if (parent) {
      chip.label = mod.name.slice(parent.name.length + 1);
      parent.chip.children.push(chip);
    } else {
      roots.push(chip);
    }
    placed.push({ name: mod.name, chip });
  }

  const groups = new Map<string | null, ModuleChip[]>();
  for (const chip of roots) {
    const slash = chip.module.name.lastIndexOf('/');
    const folder = slash === -1 ? null : chip.module.name.slice(0, slash);
    if (folder !== null) chip.label = chip.module.name.slice(slash + 1);
    const list = groups.get(folder);
    if (list) list.push(chip);
    else groups.set(folder, [chip]);
  }

  const declaredFirst = (a: ModuleChip, b: ModuleChip): number =>
    a.declared === b.declared
      ? a.label.localeCompare(b.label)
      : a.declared
        ? -1
        : 1;

  const result: ChipGroup[] = [...groups.entries()].map(([folder, chips]) => ({
    folder,
    chips: chips.sort(declaredFirst),
  }));

  return result.sort((a, b) => {
    if (a.folder === null) return b.folder === null ? 0 : -1;
    if (b.folder === null) return 1;
    return a.folder.localeCompare(b.folder);
  });
}

/**
 * Module keys of a chip and all its descendants — used to decide whether a
 * parent chip or collapsed overflow contains a highlighted module.
 */
export function chipKeys(chip: ModuleChip): string[] {
  return [chip.module.key, ...chip.children.flatMap(chipKeys)];
}
