import { stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';

import { Effect } from 'effect';
import {
  ConfigError,
  CruiseError,
  loadModuleSource,
  ModuleSourceNotFound,
  ModuleSourceReadError as LaymosModuleSourceReadError,
} from 'laymos';
import {
  ConfigParseError,
  ConfigReadError,
  ConfigSchemaError,
  ConfigValidationError,
  InvalidProjectPath,
  ModuleSourceNotFoundError,
  ModuleSourceReadError,
  SourceAnalysisError,
} from '../../rpc/index.js';

export function getLaymosModuleSource(projectPath: string, modulePath: string) {
  return Effect.gen(function* () {
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

    return yield* loadModuleSource(
      join(absolute, 'laymos.config.json'),
      modulePath,
    ).pipe(Effect.mapError(toRpcError));
  });
}

function expandHome(path: string): string {
  if (path === '~') return homedir();
  return path.startsWith('~/') ? join(homedir(), path.slice(2)) : path;
}

function toRpcError(cause: unknown) {
  if (cause instanceof ConfigError) {
    switch (cause.reason) {
      case 'read':
        return new ConfigReadError({ message: 'Could not read the Config.' });
      case 'parse':
        return new ConfigParseError({
          message: 'The Config is not valid JSON.',
        });
      case 'schema':
        return new ConfigSchemaError({
          message: 'The Config does not match the Laymos schema.',
        });
      case 'validation':
        return new ConfigValidationError({ issues: cause.issues });
    }
  }
  if (cause instanceof CruiseError) {
    return new SourceAnalysisError({
      message: 'Laymos could not analyze the Project source files.',
      baseDir: cause.baseDir,
    });
  }
  if (cause instanceof ModuleSourceNotFound) {
    return new ModuleSourceNotFoundError({ modulePath: cause.modulePath });
  }
  if (cause instanceof LaymosModuleSourceReadError) {
    return new ModuleSourceReadError({
      filePath: cause.filePath,
      message: 'Could not read the Module source file.',
    });
  }
  return new SourceAnalysisError({
    message: 'Laymos could not load the Module source.',
  });
}
