import { Data, Effect } from 'effect';
import { NodeServices } from '@effect/platform-node';

import {
  fileDependencies,
  folderDependencies,
  type DependencyQueryOptions,
  type FileGraph,
} from '../../domain/file-graph/index.js';
import { ConfigServiceLive } from '../../services/config/index.js';
import { CruiserLive } from '../../services/file-cruiser/index.js';
import { loadProject } from '../load-project/index.js';

export class DependencyTargetNotFound extends Data.TaggedError(
  'DependencyTargetNotFound',
)<{
  readonly target: string;
}> {}

export function queryDependencies(
  configPath: string,
  target: string,
  options: DependencyQueryOptions = {},
) {
  return loadProject(configPath).pipe(
    Effect.flatMap(({ fileGraph }) => query(fileGraph, target, options)),
    Effect.provide(ConfigServiceLive),
    Effect.provide(CruiserLive),
    Effect.provide(NodeServices.layer),
  );
}

function query(
  fileGraph: FileGraph,
  target: string,
  options: DependencyQueryOptions,
) {
  if (fileGraph.has(target)) {
    return Effect.succeed(fileDependencies(fileGraph, target, options));
  }
  if ([...fileGraph.keys()].some((path) => path.startsWith(`${target}/`))) {
    return Effect.succeed(folderDependencies(fileGraph, target, options));
  }
  return new DependencyTargetNotFound({ target });
}
