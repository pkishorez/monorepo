import { readFile } from 'node:fs/promises';

import { Effect } from 'effect';
import { parseSync } from 'oxc-parser';

import type { ConfigError } from '../../services/config/index.js';
import type { StoriesError } from './errors.js';
import {
  findStoryFolders,
  proofFilesOf,
  readStoriesConfig,
} from './load-stories.js';

export interface SelfContainedViolation {
  readonly id: string;
  readonly specifier: string;
}

/** Every relative import in a Proof file: a Proof imports only what the Project ships. */
export function findSelfContainedViolations(
  configPath: string,
): Effect.Effect<
  readonly SelfContainedViolation[],
  ConfigError | StoriesError
> {
  return Effect.gen(function* () {
    const config = yield* readStoriesConfig(configPath);
    const files = proofFilesOf(yield* findStoryFolders(config));
    const perFile = yield* Effect.forEach(files, ({ id, path }) =>
      Effect.promise(() => readFile(path, 'utf8')).pipe(
        Effect.map((source) =>
          specifiers(path, source)
            .filter((specifier) => /^\.\.?(\/|$)/.test(specifier))
            .map((specifier) => ({ id, specifier })),
        ),
      ),
    );
    return perFile.flat();
  });
}

function specifiers(path: string, source: string): readonly string[] {
  const { module } = parseSync(path, source);
  return [
    ...module.staticImports.map(({ moduleRequest }) => moduleRequest.value),
    ...module.staticExports.flatMap(({ entries }) =>
      entries.flatMap(({ moduleRequest }) =>
        moduleRequest === null ? [] : [moduleRequest.value],
      ),
    ),
    ...module.dynamicImports.flatMap(({ moduleRequest }) => {
      const text = source.slice(moduleRequest.start, moduleRequest.end);
      return /^['"`]/.test(text) ? [text.slice(1, -1)] : [];
    }),
  ];
}
