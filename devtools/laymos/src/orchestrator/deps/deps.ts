import { Data, Effect } from 'effect';

import {
  fileDependencies,
  folderDependencies,
  type DependencyQueryOptions,
  type FileGraph,
} from '../../domain/file-graph/index.js';
import { analyzeProject } from '../project-analysis/index.js';

type DepsTargetKind = 'file' | 'folder';

export class DepsTargetError extends Data.TaggedError('DepsTargetError')<{
  readonly target: string;
}> {}

export function deps(
  configPath: string,
  target: string,
  targetKind: DepsTargetKind,
  options: DependencyQueryOptions = {},
) {
  return Effect.gen(function* () {
    const { fileGraph } = yield* analyzeProject(configPath);
    if (!containsTarget(fileGraph, target, targetKind)) {
      return yield* new DepsTargetError({ target });
    }
    return targetKind === 'file'
      ? fileDependencies(fileGraph, target, options)
      : folderDependencies(fileGraph, target, options);
  });
}

function containsTarget(
  fileGraph: FileGraph,
  target: string,
  targetKind: DepsTargetKind,
): boolean {
  if (targetKind === 'file') return fileGraph.has(target);
  return [...fileGraph.keys()].some(
    (path) => path === target || path.startsWith(`${target}/`),
  );
}
