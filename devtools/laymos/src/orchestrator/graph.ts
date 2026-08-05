import { Effect } from 'effect';

import { Cruiser } from '../services/extract-dependencies/index.js';

export function graph(
  baseDir: string,
  sourceRoots: readonly string[],
  ignoredPaths?: readonly string[],
) {
  return Effect.gen(function* () {
    const cruiser = yield* Cruiser;
    return yield* cruiser.cruise(baseDir, sourceRoots, ignoredPaths);
  });
}
