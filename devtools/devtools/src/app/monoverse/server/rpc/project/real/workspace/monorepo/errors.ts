import { Data } from 'effect';

export class MonorepoReadError extends Data.TaggedError('MonorepoReadError')<{
  readonly reason: 'no-package-json' | 'workspace-parse' | 'glob';
  readonly path: string;
  readonly cause?: unknown;
}> {}
