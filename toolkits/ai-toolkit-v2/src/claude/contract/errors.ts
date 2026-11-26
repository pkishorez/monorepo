import { Data } from 'effect';

export class NotLive extends Data.TaggedError('NotLive')<{
  readonly id: string;
}> {}

export class ClaudeError extends Data.TaggedError('ClaudeError')<{
  readonly message: string;
  readonly cause?: unknown;
}> {}
