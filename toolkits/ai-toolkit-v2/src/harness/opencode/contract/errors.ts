import { Data } from 'effect';

export class NotLive extends Data.TaggedError('NotLive')<{
  readonly id: string;
}> {}

export class OpenCodeError extends Data.TaggedError('OpenCodeError')<{
  readonly message: string;
  readonly cause?: unknown;
}> {}
