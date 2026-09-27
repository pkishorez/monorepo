import type { ArchitectureAnalysis, ChangeSet, ChangeStatus } from 'laymos';

import { rollUpChanges } from '../../git-changes';

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
    modules: rollUpChanges(analysis.moduleAnalysis.membership, files),
    layers: rollUpChanges(analysis.layerAnalysis.membership, files),
  };
}
