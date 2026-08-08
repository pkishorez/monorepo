export type FileGraph = ReadonlyMap<string, readonly string[]>;

export interface FileDependency {
  readonly path: string;
  readonly kind: 'direct' | 'recursive';
}

export interface FileInspectionOptions {
  readonly recursive?: boolean;
}

export function fileDependencies(
  graph: FileGraph,
  path: string,
  options: FileInspectionOptions = {},
): readonly FileDependency[] {
  return dependenciesOutside(graph, path, options.recursive ?? false);
}

function dependenciesOutside(
  graph: FileGraph,
  target: string,
  recursive: boolean,
): readonly FileDependency[] {
  const entries = new Map<string, 'direct' | 'recursive'>();
  const direct = new Set<string>();

  for (const dependency of graph.get(target) ?? []) {
    if (dependency === target) continue;
    direct.add(dependency);
    entries.set(dependency, 'direct');
  }

  if (recursive) {
    let frontier = [...direct];
    const visited = new Set(direct);
    while (frontier.length > 0) {
      const next: string[] = [];
      for (const path of frontier) {
        for (const dep of graph.get(path) ?? []) {
          if (dep === target || visited.has(dep)) continue;
          visited.add(dep);
          entries.set(dep, 'recursive');
          next.push(dep);
        }
      }
      frontier = next;
    }
  }

  return [...entries.entries()]
    .sort(([pathA, kindA], [pathB, kindB]) =>
      kindA === kindB
        ? pathA.localeCompare(pathB)
        : kindA === 'direct'
          ? -1
          : 1,
    )
    .map(([path, kind]) => ({ path, kind }));
}
