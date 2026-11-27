import { Data } from 'effect';

export class NotLive extends Data.TaggedError('NotLive')<{
  readonly id: string;
}> {}

export class CodexError extends Data.TaggedError('CodexError')<{
  readonly message: string;
  readonly cause?: unknown;
}> {}
