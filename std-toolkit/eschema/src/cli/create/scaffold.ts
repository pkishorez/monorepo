import { join } from 'node:path';
import { Effect, FileSystem } from 'effect';
import { writeGeneratedSchemaFiles } from './generated-files.js';
import { CreateScaffoldError, parseSchemaPath } from './schema-path.js';

export function createSchemaScaffold(
  root: string,
  schemaPath: string,
): Effect.Effect<string, CreateScaffoldError, FileSystem.FileSystem> {
  return Effect.gen(function* () {
    const schemaPathInfo = yield* parseSchemaPath(schemaPath);
    const schemaRoot = join(root, ...schemaPathInfo.segments);

    yield* ensureSchemaRootCanBeCreated(schemaRoot);
    yield* writeGeneratedSchemaFiles({
      schemaRoot,
      finalSegment: schemaPathInfo.finalSegment,
    });

    return schemaRoot;
  }).pipe(
    Effect.mapError((error) =>
      error instanceof CreateScaffoldError
        ? error
        : new CreateScaffoldError({
            message: 'Failed to create schema scaffold',
          }),
    ),
  );
}

function ensureSchemaRootCanBeCreated(
  schemaRoot: string,
): Effect.Effect<void, CreateScaffoldError, FileSystem.FileSystem> {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    if (!(yield* fs.exists(schemaRoot))) {
      return;
    }

    const info = yield* fs.stat(schemaRoot);
    if (info.type !== 'Directory') {
      return yield* Effect.fail(
        new CreateScaffoldError({
          message: 'Schema path already exists and is not a directory',
        }),
      );
    }

    const entries = yield* fs.readDirectory(schemaRoot);
    if (entries.length > 0) {
      return yield* Effect.fail(
        new CreateScaffoldError({
          message: 'Schema path already exists and is not empty',
        }),
      );
    }
  }).pipe(
    Effect.mapError((error) =>
      error instanceof CreateScaffoldError
        ? error
        : new CreateScaffoldError({
            message: 'Failed to inspect schema path before scaffolding',
          }),
    ),
  );
}
