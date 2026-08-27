import { Data } from 'effect';

import type { DocumentationScope } from '../../architecture-analysis-schema/index.js';

export class DocumentationScopeNotFound extends Data.TaggedError(
  'DocumentationScopeNotFound',
)<{
  readonly scope: DocumentationScope;
}> {}

export class DocumentationReadError extends Data.TaggedError(
  'DocumentationReadError',
)<{
  readonly path: string;
  readonly cause: unknown;
}> {}
