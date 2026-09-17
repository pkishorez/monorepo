import { Data } from 'effect';

export class ManifestError extends Data.TaggedError('ManifestError')<{
  readonly reason: 'read' | 'parse';
  readonly path: string;
  readonly cause?: unknown;
}> {}
