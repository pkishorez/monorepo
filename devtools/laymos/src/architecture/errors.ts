import { Data } from 'effect';

export class ExtractError extends Data.TaggedError('ExtractError')<{
  readonly baseDir: string;
  readonly cause: unknown;
}> {}

export type LaymosError =
  | import('../config/load-config/index.js').LoadConfigError
  | ExtractError;
