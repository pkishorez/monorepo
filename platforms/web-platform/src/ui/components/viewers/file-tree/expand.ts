function folderPaths(files: string[]): string[] {
  const folders = new Set<string>();
  for (const file of files) {
    const segments = file.split('/');
    for (let i = 1; i < segments.length; i++) {
      folders.add(segments.slice(0, i).join('/'));
    }
  }
  return [...folders];
}

export function expandAll(files: string[]): string[] {
  return folderPaths(files);
}

export function expandToDepth(files: string[], depth: number): string[] {
  return folderPaths(files).filter(
    (folder) => folder.split('/').length <= depth,
  );
}

export function expandTo(files: string[], path: string): string[] {
  const folders = new Set(folderPaths(files));
  const segments = path.split('/');
  const result: string[] = [];
  for (let i = 1; i <= segments.length; i++) {
    const prefix = segments.slice(0, i).join('/');
    if (folders.has(prefix)) result.push(prefix);
  }
  return result;
}

export function toggleSubtree(
  files: string[],
  expanded: string[],
  path: string,
): string[] {
  const prefix = `${path}/`;
  const outsideDescendants = expanded.filter(
    (folder) => !folder.startsWith(prefix),
  );
  const descendants = folderPaths(files).filter((folder) =>
    folder.startsWith(prefix),
  );
  if (descendants.length === 0) {
    return expanded.includes(path)
      ? outsideDescendants.filter((folder) => folder !== path)
      : [...outsideDescendants, path];
  }
  if (!expanded.includes(path)) return [...outsideDescendants, path];

  const isDeepExpanded = descendants.every((folder) =>
    expanded.includes(folder),
  );
  return isDeepExpanded
    ? outsideDescendants
    : [...new Set([...outsideDescendants, ...descendants])];
}
