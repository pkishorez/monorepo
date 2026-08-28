export interface SnapshotTree {
  readonly paths: string[];
  readonly sourcePathByTreePath: ReadonlyMap<string, string>;
  readonly treePathBySourcePath: ReadonlyMap<string, string>;
}

// A single root strips to a tree relative to it, matching how a Configured
// Module or a Module Graph is browsed today. Several roots — a Layer with
// disjoint scopes, or a LayerGraph spanning several Layers — have no one
// point to strip, so their tree keeps full project-relative paths.
export function buildSnapshotTree(
  files: readonly { readonly path: string }[],
  pathPrefixes: readonly string[],
): SnapshotTree {
  const sourcePathByTreePath = new Map<string, string>();
  const treePathBySourcePath = new Map<string, string>();
  const root =
    pathPrefixes.length === 1 && pathPrefixes[0] !== '.'
      ? pathPrefixes[0]
      : undefined;
  const fileRoot = files.some(({ path }) => path === root);

  for (const { path } of files) {
    const treePath =
      root === undefined
        ? path
        : fileRoot
          ? (path.split('/').at(-1) ?? path)
          : path.slice(`${root}/`.length);
    sourcePathByTreePath.set(treePath, path);
    treePathBySourcePath.set(path, treePath);
  }

  return {
    paths: [...sourcePathByTreePath.keys()],
    sourcePathByTreePath,
    treePathBySourcePath,
  };
}
