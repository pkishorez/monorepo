import { dirname, resolve } from 'node:path';

import { Data, Effect } from 'effect';

import {
  fileDependencies,
  folderDependencies,
} from '../domain/file-graph/index.js';
import { Cruiser } from '../services/file-cruiser/index.js';
import { ConfigService } from '../services/config/index.js';

export type DepsTargetKind = 'file' | 'folder';

export class DepsTargetError extends Data.TaggedError('DepsTargetError')<{
  readonly target: string;
}> {}

export function deps(
  configPath: string,
  target: string,
  targetKind: DepsTargetKind,
  options: {
    readonly recursive?: boolean;
    readonly ignoredPaths?: readonly string[];
  } = {},
) {
  return Effect.gen(function* () {
    const absoluteConfigPath = resolve(configPath);
    const baseDir = dirname(absoluteConfigPath);
    const configService = yield* ConfigService;
    const config = yield* configService.read(absoluteConfigPath);
    const cruiser = yield* Cruiser;
    const fileGraph = yield* cruiser.cruise(
      baseDir,
      config.sourceRoots,
      config.ignoredPaths,
    );
    if (!containsTarget(fileGraph, target, targetKind)) {
      return yield* new DepsTargetError({ target });
    }
    return targetKind === 'file'
      ? fileDependencies(fileGraph, target, options)
      : folderDependencies(fileGraph, target, options);
  });
}

function containsTarget(
  fileGraph: ReadonlyMap<string, unknown>,
  target: string,
  targetKind: DepsTargetKind,
): boolean {
  if (targetKind === 'file') return fileGraph.has(target);
  return [...fileGraph.keys()].some(
    (path) => path === target || path.startsWith(`${target}/`),
  );
}
