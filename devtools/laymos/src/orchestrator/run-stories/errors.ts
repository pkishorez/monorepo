import { Data } from 'effect';

export class StoriesError extends Data.TaggedError('StoriesError')<{
  readonly reason:
    | 'no-stories-path'
    | 'load'
    | 'invalid-root'
    | 'duplicate-title'
    | 'duplicate-question'
    | 'snippet-extraction'
    | 'unknown-scope'
    | 'invalid-timeout';
  readonly path: string;
  readonly cause: unknown;
}> {}
