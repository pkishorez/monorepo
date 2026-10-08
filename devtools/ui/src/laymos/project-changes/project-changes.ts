import type { ArchitectureAnalysis, ChangeSet, ChangeStatus } from 'laymos';

export interface ChangeIndex {
  readonly baseRef: string;
  /** Every changed path the Change set carries, by path. */
  readonly files: ReadonlyMap<string, ChangeStatus>;
  /**
   * Each node of the Module tree a changed file is owned by: added when
   * every file beneath it is added, modified otherwise. A Wrapper or Module
   * above a changed node carries the roll-up too, so a collapsed chain and
   * the Project card read as changed. A deleted file marks the deepest node
   * below the Project still holding it modified, and a deleted Module reads
   * deleted.
   */
  readonly modules: ReadonlyMap<string, ChangeStatus>;
  /**
   * Folder Modules the change took away: a deleted Index whose folder is no
   * node of the tree any more and lay in the analysis universe, beneath a
   * Source root and outside every Ignored path and the Stories path.
   */
  readonly deletedModules: readonly string[];
}

const indexPattern = /\/index\.tsx?$/;

/** Indexes a Change set by the nodes of the Module tree, through `tree.owners`. */
export function indexChanges(
  analysis: ArchitectureAnalysis,
  changes: ChangeSet,
): ChangeIndex {
  const files = new Map(
    changes.files.map(({ path, status }) => [path, status]),
  );
  const parentOf = new Map(
    analysis.tree.nodes.map((node) => [node.path, node.parent]),
  );
  const total = new Map<string, number>();
  const added = new Map<string, number>();
  const touched = new Set<string>();
  for (const [file, owner] of Object.entries(analysis.tree.owners)) {
    const status = files.get(file);
    for (let node: string | undefined = owner; node !== undefined;) {
      total.set(node, (total.get(node) ?? 0) + 1);
      if (status !== undefined) {
        touched.add(node);
        if (status === 'added') added.set(node, (added.get(node) ?? 0) + 1);
      }
      node = parentOf.get(node);
    }
  }
  // A deleted file belongs to no node now: it marks the deepest one still
  // holding its path.
  const paths = [...parentOf.keys()];
  const holding = (path: string) =>
    paths.reduce<string | undefined>(
      (best, node) =>
        (node === '.' || path.startsWith(`${node}/`)) &&
        (best === undefined || best === '.' || node.length > best.length)
          ? node
          : best,
      undefined,
    );
  const within = (folder: string, path: string) =>
    folder === '.' || path === folder || path.startsWith(`${folder}/`);
  const { sourceRoots, ignoredPaths, storiesPath } = analysis.config;
  const analyzed = (path: string) =>
    sourceRoots.some((root) => within(root, path)) &&
    !ignoredPaths.some((ignored) => within(ignored, path)) &&
    (storiesPath === undefined || !within(storiesPath, path));
  const deletedModules = new Set<string>();
  for (const { path, status } of changes.files) {
    if (status !== 'deleted' || !analyzed(path)) continue;
    const holder = holding(path);
    // A loose file beside the Project's Modules belonged to none of them.
    if (holder !== undefined && holder !== '.')
      for (
        let node: string | undefined = holder;
        node !== undefined;
        node = parentOf.get(node)
      )
        touched.add(node);
    if (indexPattern.test(path)) {
      const folder = path.replace(indexPattern, '');
      if (!parentOf.has(folder)) deletedModules.add(folder);
    }
  }
  const modules = new Map<string, ChangeStatus>();
  for (const node of touched)
    modules.set(
      node,
      added.get(node) === total.get(node) && total.has(node)
        ? 'added'
        : 'modified',
    );
  for (const folder of deletedModules) modules.set(folder, 'deleted');
  return {
    baseRef: changes.baseRef,
    files,
    modules,
    deletedModules: [...deletedModules].sort(),
  };
}
