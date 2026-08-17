import type { ArchitectureAnalysis, ChangeSet, ChangeStatus } from 'laymos';

export interface ChangeIndex {
  readonly baseRef: string;
  readonly files: ReadonlyMap<string, ChangeStatus>;
  readonly modules: ReadonlyMap<string, ChangeStatus>;
  readonly layers: ReadonlyMap<string, ChangeStatus>;
}

export function indexChanges(
  analysis: ArchitectureAnalysis,
  changes: ChangeSet,
): ChangeIndex {
  const files = new Map(
    changes.files.map(({ path, status }) => [path, status]),
  );
  return {
    baseRef: changes.baseRef,
    files,
    modules: rollUp(analysis.moduleAnalysis.membership, files),
    layers: rollUp(analysis.layerAnalysis.membership, files),
  };
}

export function changedPathsUnder(
  index: ChangeIndex,
  prefix: string,
): ReadonlyMap<string, ChangeStatus> {
  const owned = new Map<string, ChangeStatus>();
  for (const [path, status] of index.files) {
    if (path === prefix || path.startsWith(`${prefix}/`)) {
      owned.set(path, status);
    }
  }
  return owned;
}

function rollUp(
  membership: ReadonlyMap<string, string>,
  files: ReadonlyMap<string, ChangeStatus>,
): ReadonlyMap<string, ChangeStatus> {
  const total = new Map<string, number>();
  const added = new Map<string, number>();
  const touched = new Map<string, number>();

  for (const [file, owner] of membership) {
    total.set(owner, (total.get(owner) ?? 0) + 1);
    const status = files.get(file);
    if (status === undefined) continue;
    touched.set(owner, (touched.get(owner) ?? 0) + 1);
    if (status === 'added') added.set(owner, (added.get(owner) ?? 0) + 1);
  }

  const rolled = new Map<string, ChangeStatus>();
  for (const [owner, count] of touched) {
    if (count === 0) continue;
    rolled.set(
      owner,
      added.get(owner) === total.get(owner) ? 'added' : 'modified',
    );
  }
  return rolled;
}
