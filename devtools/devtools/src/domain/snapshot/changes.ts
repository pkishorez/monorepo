import type { ArchitectureAnalysis, ChangeSet } from 'laymos';

// A Snapshot shows what the branch's commits changed; work not yet committed
// is left unmarked.
export function committedOnly(changes: ChangeSet): ChangeSet {
  return { ...changes, files: changes.files.filter((file) => file.committed) };
}

// The Modules a Change set touches, by the analysis's own file membership.
export function countChangedModules(
  analysis: ArchitectureAnalysis,
  changes: ChangeSet,
): number {
  const touched = new Set<string>();
  for (const { path } of changes.files) {
    const owner = analysis.moduleAnalysis.membership.get(path);
    if (owner !== undefined) touched.add(owner);
  }
  return touched.size;
}
