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
