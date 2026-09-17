import { Data } from 'effect';

export class MonorepoReadError extends Data.TaggedError('MonorepoReadError')<{
  readonly reason: 'not-a-workspace' | 'workspace-parse' | 'glob';
  readonly path: string;
  readonly cause?: unknown;
}> {}
