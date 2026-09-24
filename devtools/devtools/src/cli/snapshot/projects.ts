import { execFile } from 'node:child_process';
import { dirname } from 'node:path';
import { promisify } from 'node:util';

import { Effect } from 'effect';
import { GitError, loadChangeSet } from 'laymos';

import { changedProjectDirs } from '../../domain/snapshot/index.js';

export function findChangedProjects(root: string, base: string) {
  return Effect.gen(function* () {
    const changes = yield* loadChangeSet(root, base);
    const dirs = yield* listProjectDirs(root);
    return changedProjectDirs(
      dirs,
      changes.files.filter((file) => file.committed).map((file) => file.path),
    );
  });
}

function listProjectDirs(root: string) {
  return Effect.tryPromise({
    try: async () => {
      const { stdout } = await promisify(execFile)(
        'git',
        [
          'ls-files',
          '-z',
          '--cached',
          '--others',
          '--exclude-standard',
          '--',
          ':(glob)**/laymos.config.json',
          ':(exclude,glob)**/fixtures/**',
        ],
        { cwd: root, maxBuffer: 16 * 1024 * 1024 },
      );
      return [
        ...new Set(
          stdout
            .split('\0')
            .filter(Boolean)
            .map((file) => dirname(file)),
        ),
      ].sort();
    },
    catch: (cause) =>
      new GitError({ reason: 'command-failed', baseDir: root, cause }),
  });
}
