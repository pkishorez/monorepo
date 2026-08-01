import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { relative } from 'node:path';
import { Context, Effect, Layer } from 'effect';
import type { Thread } from '../../domain/thread/index.js';

export class GitError {
  readonly _tag = 'GitError';
  constructor(
    readonly code: string,
    readonly message: string,
  ) {}
}

const git = (directory: string, args: string[]) =>
  new Promise<{ stdout: string; exitCode: number }>((resolve) => {
    execFile('git', args, { cwd: directory }, (error, stdout) => {
      resolve({ stdout, exitCode: error ? 1 : 0 });
    });
  });

const makeGit = () => ({
  contextOf: (
    directory: string,
  ): Effect.Effect<Thread['gitContext'], GitError> =>
    Effect.gen(function* () {
      const stats = yield* Effect.tryPromise({
        try: () => fs.stat(directory),
        catch: () =>
          new GitError('invalid_directory', `Not a directory: ${directory}`),
      });
      if (!stats.isDirectory()) {
        return yield* Effect.fail(
          new GitError('invalid_directory', `Not a directory: ${directory}`),
        );
      }
      const top = yield* Effect.promise(() =>
        git(directory, ['rev-parse', '--show-toplevel']),
      );
      if (top.exitCode !== 0) return null;
      const origin = yield* Effect.promise(() =>
        git(directory, ['remote', 'get-url', 'origin']),
      );
      const originUrl = origin.stdout.trim();
      return {
        githubUrl: origin.exitCode === 0 && originUrl !== '' ? originUrl : null,
        relativePath: relative(top.stdout.trim(), directory),
      };
    }).pipe(Effect.withSpan('code.git.context')),
});

export class Git extends Context.Service<Git, ReturnType<typeof makeGit>>()(
  'code/Git',
) {}

export const gitLayer = Layer.sync(Git, makeGit);
