import type { ModuleSourceSnapshot } from 'laymos';

export interface SnapshotTree {
  readonly paths: string[];
  readonly sourcePathByTreePath: ReadonlyMap<string, string>;
  readonly treePathBySourcePath: ReadonlyMap<string, string>;
}

export function buildSnapshotTree(
  snapshot: ModuleSourceSnapshot,
): SnapshotTree {
  const sourcePathByTreePath = new Map<string, string>();
  const treePathBySourcePath = new Map<string, string>();
  const fileModule = snapshot.files.some(
    ({ path }) => path === snapshot.modulePath,
  );

  for (const { path } of snapshot.files) {
    const treePath = fileModule
      ? (path.split('/').at(-1) ?? path)
      : path.slice(`${snapshot.modulePath}/`.length);
    sourcePathByTreePath.set(treePath, path);
    treePathBySourcePath.set(path, treePath);
  }

  return {
    paths: [...sourcePathByTreePath.keys()],
    sourcePathByTreePath,
    treePathBySourcePath,
  };
}
