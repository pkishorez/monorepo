import { stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';

import { Effect, Stream } from 'effect';
import { ConfigError, runStories, StoriesError } from 'laymos';
import {
  ConfigParseError,
  ConfigReadError,
  ConfigSchemaError,
  ConfigValidationError,
  InvalidProjectPath,
  StoriesUnavailableError,
} from '../../rpc/index.js';

export function runLaymosStories(projectPath: string, scope?: string) {
  return Stream.unwrap(
    Effect.gen(function* () {
      const expanded = expandHome(projectPath);
      if (!isAbsolute(expanded)) {
        return yield* new InvalidProjectPath({ reason: 'relative' });
      }

      const absolute = resolve(expanded);
      const project = yield* Effect.tryPromise({
        try: () => stat(absolute),
        catch: () => new InvalidProjectPath({ reason: 'not-found' }),
      });
      if (!project.isDirectory()) {
        return yield* new InvalidProjectPath({ reason: 'not-directory' });
      }

      return runStories(join(absolute, 'laymos.config.json'), { scope }).pipe(
        Stream.mapError(toRpcError),
      );
    }),
  );
}

function expandHome(path: string): string {
  if (path === '~') return homedir();
  return path.startsWith('~/') ? join(homedir(), path.slice(2)) : path;
}

function toRpcError(cause: ConfigError | StoriesError) {
  if (cause instanceof StoriesError) {
    return new StoriesUnavailableError({
      reason: cause.reason,
      path: cause.path,
    });
  }
  switch (cause.reason) {
    case 'read':
      return new ConfigReadError({ message: 'Could not read the Config.' });
    case 'parse':
      return new ConfigParseError({ message: 'The Config is not valid JSON.' });
    case 'schema':
      return new ConfigSchemaError({
        message: 'The Config does not match the Laymos schema.',
      });
    case 'validation':
      return new ConfigValidationError({ issues: cause.issues });
  }
}
