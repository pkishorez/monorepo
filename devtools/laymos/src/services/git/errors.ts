import { Data } from 'effect';

export class GitError extends Data.TaggedError('GitError')<{
  readonly reason: 'not-a-repo' | 'unknown-ref' | 'command-failed';
  readonly baseDir: string;
  readonly cause: unknown;
}> {}
