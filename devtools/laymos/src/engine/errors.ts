import { Data } from 'effect';

export class ConfigLoadError extends Data.TaggedError('ConfigLoadError')<{
  readonly path: string;
  readonly cause: unknown;
}> {}

export class ExtractError extends Data.TaggedError('ExtractError')<{
  readonly baseDir: string;
  readonly cause: unknown;
}> {}

export type LaymosError = ConfigLoadError | ExtractError;
