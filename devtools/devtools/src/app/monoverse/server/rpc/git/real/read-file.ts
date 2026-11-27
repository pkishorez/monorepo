import { isAbsolute, posix } from 'node:path';

import { Effect } from 'effect';

import { Snapshots } from '../../../services/snapshots/contract/index.js';
import {
  FileNotFoundError,
  FileOutsideError,
  FileReadError,
} from '../contract/index.js';

const gitBinarySniffLength = 8000;

export function readRootFile(
  root: string,
  branch: string | null,
  path: string,
) {
  return Effect.gen(function* () {
    const normalized = posix.normalize(path);
    if (
      isAbsolute(path) ||
      normalized === '.' ||
      normalized === '..' ||
      normalized.startsWith('../')
    ) {
      return yield* new FileOutsideError({ path });
    }
    const snapshots = yield* Snapshots;
    const snapshot = yield* snapshots.open(root, branch);
    const bytes = yield* Effect.tryPromise({
      try: () => snapshot.read(normalized),
      catch: () =>
        new FileReadError({
          path: normalized,
          message: 'Could not read the file.',
        }),
    });
    if (bytes === undefined) {
      return yield* new FileNotFoundError({ path: normalized });
    }
    const binary = bytes.subarray(0, gitBinarySniffLength).includes(0);
    return {
      path: normalized,
      content: binary ? '' : new TextDecoder().decode(bytes),
      ...(binary ? { binary } : {}),
    };
  });
}
