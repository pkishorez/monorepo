import { Context, Effect, Layer } from 'effect';

import type { FileGraph } from '../../domain/file-graph/index.js';
import type { CruiseError } from './errors.js';
import { buildFileGraph } from './oxc/index.js';

export class Cruiser extends Context.Service<
  Cruiser,
  {
    readonly cruise: (
      baseDir: string,
      sourceRoots: readonly string[],
      ignoredPaths?: readonly string[],
    ) => Effect.Effect<FileGraph, CruiseError>;
  }
>()('Cruiser') {}

export const CruiserLive = Layer.succeed(Cruiser)({
  cruise: (baseDir, sourceRoots, ignoredPaths = []) =>
    buildFileGraph(baseDir, sourceRoots, ignoredPaths),
});
