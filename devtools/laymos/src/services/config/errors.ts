import { Data } from 'effect';

export class ConfigError extends Data.TaggedError('ConfigError')<{
  readonly reason: 'read' | 'parse' | 'schema';
  readonly filePath: string;
  readonly cause: unknown;
}> {}
