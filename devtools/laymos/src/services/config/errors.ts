import { Data } from 'effect';

import type { ConfigValidationIssue } from '../../domain/project-config/index.js';

export class ConfigError extends Data.TaggedError('ConfigError')<{
  readonly reason: 'read' | 'parse' | 'schema' | 'validation';
  readonly filePath: string;
  readonly cause: unknown;
  readonly issues: readonly ConfigValidationIssue[];
}> {}
