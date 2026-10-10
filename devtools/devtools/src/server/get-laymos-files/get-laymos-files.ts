import { stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';

import { Effect } from 'effect';
import {
  ConfigError,
  CruiseError,
  FileNotFound,
  FileReadError as LaymosFileReadError,
  loadFileContent,
  loadFileList,
} from 'laymos';
import {
  ConfigParseError,
  ConfigReadError,
  ConfigSchemaError,
  ConfigValidationError,
  FileNotFoundError,
  FileReadError,
  InvalidProjectPath,
  SourceAnalysisError,
} from '../../rpc/index.js';

/** Fulfils `GetLaymosFileList`: the File list of one Module or Wrapper. */
export function getLaymosFileList(projectPath: string, modulePath: string) {
  return Effect.gen(function* () {
    const configPath = yield* projectConfigPath(projectPath);
    return yield* loadFileList(configPath, modulePath).pipe(
      Effect.mapError(toRpcError),
    );
  });
}

/** Fulfils `GetLaymosFile`: the content of one file of the Project. */
export function getLaymosFile(projectPath: string, path: string) {
  return Effect.gen(function* () {
    const configPath = yield* projectConfigPath(projectPath);
    return yield* loadFileContent(configPath, path).pipe(
      Effect.mapError(toRpcError),
    );
  });
}

function projectConfigPath(projectPath: string) {
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

    return join(absolute, 'laymos.config.json');
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
  if (cause instanceof FileNotFound) {
    return new FileNotFoundError({ path: cause.path });
  }
  if (cause instanceof LaymosFileReadError) {
    return new FileReadError({
      filePath: cause.filePath,
      message: 'Could not read the file.',
    });
  }
  return new SourceAnalysisError({
    message: 'Laymos could not load the Project files.',
  });
}
