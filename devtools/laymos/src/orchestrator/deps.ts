import { Effect } from 'effect';

import {
  fileDependencies,
  folderDependencies,
} from '../domain/file-graph/index.js';
import { Cruiser } from '../services/file-cruiser/index.js';

export type DepsTargetKind = 'file' | 'folder';

export function deps(
  baseDir: string,
  sourceRoots: readonly string[],
  target: string,
  targetKind: DepsTargetKind,
  options: {
    readonly recursive?: boolean;
    readonly ignoredPaths?: readonly string[];
  } = {},
) {
  return Effect.gen(function* () {
    const cruiser = yield* Cruiser;
    const fileGraph = yield* cruiser.cruise(
      baseDir,
      sourceRoots,
      options.ignoredPaths,
    );
    return targetKind === 'file'
      ? fileDependencies(fileGraph, target, options)
      : folderDependencies(fileGraph, target, options);
  });
}
