import { Data } from 'effect';

export class StoriesError extends Data.TaggedError('StoriesError')<{
  readonly reason:
    | 'no-stories-path'
    | 'load'
    | 'invalid-root'
    | 'duplicate-title'
    | 'unknown-scope';
  readonly path: string;
  readonly cause: unknown;
}> {}
