import { Data } from 'effect';

export interface ConfigValidationIssue {
  readonly kind: 'path' | 'overlap' | 'reference' | 'cycle' | 'module';
  readonly message: string;
}

export class ConfigError extends Data.TaggedError('ConfigError')<{
  readonly reason: 'read' | 'parse' | 'schema' | 'validation';
  readonly filePath: string;
  readonly cause: unknown;
  readonly issues: readonly ConfigValidationIssue[];
}> {}
