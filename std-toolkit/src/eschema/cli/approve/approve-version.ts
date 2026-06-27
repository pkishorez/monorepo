import { join } from 'node:path';
import { Data, Effect, FileSystem } from 'effect';
import { hashSnapshotContent } from '../shared/schema-snapshots/index.js';

export class SnapshotApprovalError extends Data.TaggedError(
  'SnapshotApprovalError',
)<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export function approveVersionSnapshot(input: {
  readonly schemaRoot: string;
  readonly version: string;
}): Effect.Effect<void, SnapshotApprovalError, FileSystem.FileSystem> {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const versionFile = join(
      input.schemaRoot,
      'versions',
      `${input.version}.ts`,
    );
    const snapshotFile = join(
      input.schemaRoot,
      '__snapshots__',
      `${input.version}.ts.snap`,
    );
    const manifestFile = join(input.schemaRoot, 'snapshots.json');

    const versionContent = yield* fs.readFileString(versionFile);

    yield* fs.makeDirectory(join(input.schemaRoot, '__snapshots__'), {
      recursive: true,
    });
    yield* fs.writeFileString(snapshotFile, versionContent);

    const snapshotContent = yield* fs.readFileString(snapshotFile);
    const manifest = yield* readManifest(manifestFile);
    manifest[input.version] = hashSnapshotContent(snapshotContent);
    yield* fs.writeFileString(
      manifestFile,
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
  }).pipe(
    Effect.mapError(
      (cause) =>
        new SnapshotApprovalError({
          message: `Failed to approve snapshot ${input.version}`,
          cause,
        }),
    ),
  );
}

function readManifest(
  path: string,
): Effect.Effect<Record<string, string>, unknown, FileSystem.FileSystem> {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const exists = yield* fs.exists(path);
    if (!exists) {
      return {};
    }

    const content = yield* fs.readFileString(path);
    return yield* Effect.try({
      try: () => {
        const parsed: unknown = JSON.parse(content);
        if (
          typeof parsed !== 'object' ||
          parsed === null ||
          Array.isArray(parsed)
        ) {
          return {};
        }

        return Object.fromEntries(
          Object.entries(parsed).filter((entry): entry is [string, string] => {
            const [, value] = entry;
            return typeof value === 'string';
          }),
        );
      },
      catch: (cause) => cause,
    });
  });
}
