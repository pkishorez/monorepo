import { Data } from 'effect';

export class StoriesError extends Data.TaggedError('StoriesError')<{
  readonly reason:
    | 'no-stories-path'
    | 'load'
    | 'invalid-proof'
    | 'unknown-scope'
    | 'invalid-timeout';
  readonly path: string;
  readonly cause: unknown;
}> {}
