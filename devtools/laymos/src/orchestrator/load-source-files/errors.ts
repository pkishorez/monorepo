import { Data } from 'effect';

export class SourceFileReadError extends Data.TaggedError(
  'SourceFileReadError',
)<{
  readonly filePath: string;
  readonly cause: unknown;
}> {}
