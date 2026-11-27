import { stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';

import { Effect } from 'effect';

import { InvalidRootError } from '../../../rpc/project/contract/index.js';

export function existingRoot(root: string) {
  return Effect.gen(function* () {
    const expanded = expandHome(root);
    if (!isAbsolute(expanded)) {
      return yield* new InvalidRootError({ reason: 'relative', path: root });
    }
    const absolute = resolve(expanded);
    const entry = yield* Effect.tryPromise({
      try: () => stat(absolute),
      catch: () => new InvalidRootError({ reason: 'not-found', path: root }),
    });
    if (!entry.isDirectory()) {
      return yield* new InvalidRootError({
        reason: 'not-directory',
        path: root,
      });
    }
    return absolute;
  });
}

function expandHome(path: string): string {
  if (path === '~') return homedir();
  return path.startsWith('~/') ? join(homedir(), path.slice(2)) : path;
}
