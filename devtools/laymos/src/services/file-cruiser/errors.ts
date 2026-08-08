import { Data } from 'effect';

export class CruiseError extends Data.TaggedError('CruiseError')<{
  readonly baseDir: string;
  readonly cause: unknown;
}> {}
