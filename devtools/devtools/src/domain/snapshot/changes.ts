import type { ArchitectureAnalysis, ChangeSet } from 'laymos';

// A Snapshot shows what the branch's commits changed; work not yet committed
// is left unmarked.
export function committedOnly(changes: ChangeSet): ChangeSet {
  return { ...changes, files: changes.files.filter((file) => file.committed) };
}

// Every Module of the tree; Wrappers are not counted.
export function countModules(analysis: ArchitectureAnalysis): number {
  return analysis.tree.nodes.filter((node) => node.kind === 'module').length;
}

// The Modules a Change set touches, by the tree's own file ownership. A file
// a Wrapper owns touches no Module.
export function countChangedModules(
  analysis: ArchitectureAnalysis,
  changes: ChangeSet,
): number {
  const kinds = new Map(
    analysis.tree.nodes.map((node) => [node.path, node.kind] as const),
  );
  const touched = new Set<string>();
  for (const { path } of changes.files) {
    const owner = analysis.tree.owners[path];
    if (owner !== undefined && kinds.get(owner) === 'module')
      touched.add(owner);
  }
  return touched.size;
}
