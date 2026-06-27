import { join, relative } from 'node:path';
import { Effect, FileSystem } from 'effect';
import {
  SnapshotAnalysisError,
  type ManifestSource,
  type SchemaCollectionSource,
  type SchemaRootSource,
  type SnapshotFileSource,
  type VersionFileSource,
} from './model.js';

export function readSchemaCollection(
  root: string,
): Effect.Effect<
  SchemaCollectionSource,
  SnapshotAnalysisError,
  FileSystem.FileSystem
> {
  return Effect.gen(function* () {
    const schemaRoots = yield* discoverSchemaRoots(root);
    const schemas = yield* Effect.all(
      schemaRoots.map((schemaRoot) => readSchemaRoot(root, schemaRoot)),
    );

    return {
      root,
      schemas,
    };
  }).pipe(
    Effect.mapError(
      (cause) =>
        new SnapshotAnalysisError({
          message: `Failed to read schema snapshots under ${root}`,
          cause,
        }),
    ),
  );
}

function discoverSchemaRoots(
  root: string,
): Effect.Effect<readonly string[], unknown, FileSystem.FileSystem> {
  return Effect.gen(function* () {
    if (!(yield* isDirectory(root))) {
      return [];
    }
    return yield* visitDirectory(root);
  });
}

function visitDirectory(
  path: string,
): Effect.Effect<readonly string[], unknown, FileSystem.FileSystem> {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const entries = (yield* fs.readDirectory(path)).sort();
    const names = new Set(entries);

    if (
      names.has('schema.ts') ||
      names.has('versions') ||
      names.has('snapshots.json') ||
      names.has('__snapshots__')
    ) {
      return [path];
    }

    const childRoots: string[] = [];
    for (const entry of entries) {
      const child = join(path, entry);
      if (yield* isDirectory(child)) {
        childRoots.push(...(yield* visitDirectory(child)));
      }
    }

    return childRoots.sort();
  });
}

function readSchemaRoot(
  collectionRoot: string,
  schemaRoot: string,
): Effect.Effect<SchemaRootSource, unknown, FileSystem.FileSystem> {
  return Effect.gen(function* () {
    const schemaFile = join(schemaRoot, 'schema.ts');
    const versionsDirectory = join(schemaRoot, 'versions');
    const snapshotsDirectory = join(schemaRoot, '__snapshots__');

    const versionsDirectoryExists = yield* isDirectory(versionsDirectory);
    const versionFiles = versionsDirectoryExists
      ? yield* readVersionFiles(versionsDirectory)
      : [];

    return {
      path: schemaRoot,
      relativePath: relative(collectionRoot, schemaRoot) || '.',
      schemaFile,
      schemaFileContent: yield* readOptionalFile(schemaFile),
      versionsDirectory,
      versionsDirectoryExists,
      snapshotsDirectory,
      snapshotFiles: yield* readSnapshotFiles(snapshotsDirectory),
      manifest: yield* readManifest(join(schemaRoot, 'snapshots.json')),
      versionFiles,
    };
  });
}

function readVersionFiles(
  versionsDirectory: string,
): Effect.Effect<readonly VersionFileSource[], unknown, FileSystem.FileSystem> {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const entries = (yield* fs.readDirectory(versionsDirectory)).sort();
    const files: VersionFileSource[] = [];

    for (const filename of entries) {
      const path = join(versionsDirectory, filename);
      if (!(yield* isFile(path))) {
        continue;
      }

      const match = /^v([1-9]\d*)\.ts$/.exec(filename);
      files.push({
        version:
          match === null ? filename.replace(/\.ts$/, '') : `v${match[1]}`,
        number: match === null ? Number.NaN : Number(match[1]),
        path,
        filename,
        content: yield* fs.readFileString(path),
        validName: match !== null,
      });
    }

    return files.sort(
      (left, right) =>
        left.number - right.number ||
        left.filename.localeCompare(right.filename),
    );
  });
}

function readSnapshotFiles(
  snapshotsDirectory: string,
): Effect.Effect<
  readonly SnapshotFileSource[],
  unknown,
  FileSystem.FileSystem
> {
  return Effect.gen(function* () {
    if (!(yield* isDirectory(snapshotsDirectory))) {
      return [];
    }

    const fs = yield* FileSystem.FileSystem;
    const entries = (yield* fs.readDirectory(snapshotsDirectory)).sort();
    const files: SnapshotFileSource[] = [];

    for (const filename of entries) {
      if (!/^v[1-9]\d*\.ts\.snap$/.test(filename)) {
        continue;
      }

      const path = join(snapshotsDirectory, filename);
      if (!(yield* isFile(path))) {
        continue;
      }

      files.push({
        version: filename.replace(/\.ts\.snap$/, ''),
        path,
        filename,
        content: yield* fs.readFileString(path),
      });
    }

    return files.sort((left, right) =>
      left.filename.localeCompare(right.filename),
    );
  });
}

function readManifest(
  path: string,
): Effect.Effect<ManifestSource, unknown, FileSystem.FileSystem> {
  return Effect.gen(function* () {
    if (!(yield* pathExists(path))) {
      return { path, exists: false, values: {}, invalid: false };
    }

    if (!(yield* isFile(path))) {
      return { path, exists: true, values: {}, invalid: true };
    }

    const fs = yield* FileSystem.FileSystem;
    const content = yield* fs.readFileString(path);
    try {
      const parsed: unknown = JSON.parse(content);
      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        Array.isArray(parsed) ||
        !Object.values(parsed).every((value) => typeof value === 'string')
      ) {
        return { path, exists: true, values: {}, invalid: true };
      }

      return {
        path,
        exists: true,
        values: parsed as Record<string, string>,
        invalid: false,
      };
    } catch {
      return { path, exists: true, values: {}, invalid: true };
    }
  });
}

function readOptionalFile(
  path: string,
): Effect.Effect<string | null, unknown, FileSystem.FileSystem> {
  return Effect.gen(function* () {
    if (!(yield* isFile(path))) {
      return null;
    }

    const fs = yield* FileSystem.FileSystem;
    return yield* fs.readFileString(path);
  });
}

function pathExists(
  path: string,
): Effect.Effect<boolean, unknown, FileSystem.FileSystem> {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    return yield* fs.exists(path);
  });
}

function isFile(
  path: string,
): Effect.Effect<boolean, unknown, FileSystem.FileSystem> {
  return Effect.gen(function* () {
    if (!(yield* pathExists(path))) {
      return false;
    }

    const fs = yield* FileSystem.FileSystem;
    const info = yield* fs.stat(path);
    return info.type === 'File';
  });
}

function isDirectory(
  path: string,
): Effect.Effect<boolean, unknown, FileSystem.FileSystem> {
  return Effect.gen(function* () {
    if (!(yield* pathExists(path))) {
      return false;
    }

    const fs = yield* FileSystem.FileSystem;
    const info = yield* fs.stat(path);
    return info.type === 'Directory';
  });
}
