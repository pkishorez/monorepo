import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { Effect, FileSystem } from 'effect';
import type { PlatformError } from 'effect';
import { createJiti } from 'jiti';
import { Snapshot, SnapshotDecodeError } from '../../snapshot/index.js';
import type { ContractSnapshot } from '../../snapshot/index.js';
import { ContractEntryError } from './errors.js';

export { ContractEntryError };

export const entryFileName = 'std-toolkit.snapshot.ts';
export const baselineFileName = 'std-toolkit.snapshot.json';

export function loadContract(
  cwd: string,
): Effect.Effect<ContractSnapshot, ContractEntryError | SnapshotDecodeError> {
  const filePath = resolve(cwd, entryFileName);
  return Effect.gen(function* () {
    const imported = yield* Effect.tryPromise({
      try: async () => {
        const jiti = createJiti(import.meta.url, {
          interopDefault: true,
          moduleCache: false,
        });
        return (await jiti.import(filePath)) as { default?: unknown };
      },
      catch: (cause) =>
        new ContractEntryError({ reason: 'import', filePath, cause }),
    });
    if (imported.default === undefined) {
      return yield* Effect.fail(
        new ContractEntryError({
          reason: 'export',
          filePath,
          cause: undefined,
        }),
      );
    }
    return yield* Snapshot.decode(imported.default);
  });
}

export function readBaseline(
  cwd: string,
): Effect.Effect<
  ContractSnapshot | undefined,
  PlatformError.PlatformError | SnapshotDecodeError,
  FileSystem.FileSystem
> {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = resolve(cwd, baselineFileName);
    if (!(yield* fs.exists(path))) return undefined;
    const source = yield* fs.readFileString(path);
    const stored = yield* Effect.try({
      try: () => JSON.parse(source) as unknown,
      catch: (cause) =>
        new SnapshotDecodeError('Snapshot baseline is not valid JSON', cause),
    });
    return yield* Snapshot.decode(stored);
  });
}

export function writeBaseline(
  cwd: string,
  snapshot: ContractSnapshot,
): Effect.Effect<void, PlatformError.PlatformError, FileSystem.FileSystem> {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = resolve(cwd, baselineFileName);
    const temporaryPath = `${path}.${randomUUID()}.tmp`;
    yield* fs
      .writeFileString(
        temporaryPath,
        `${JSON.stringify(snapshot, null, 2)}\n`,
        {
          flag: 'wx',
        },
      )
      .pipe(
        Effect.flatMap(() => fs.rename(temporaryPath, path)),
        Effect.ensuring(
          Effect.ignore(fs.remove(temporaryPath, { force: true })),
        ),
      );
  });
}
