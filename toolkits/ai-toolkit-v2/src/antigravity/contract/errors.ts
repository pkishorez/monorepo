import { Data } from 'effect';

export class NotLive extends Data.TaggedError('NotLive')<{
  readonly id: string;
}> {}

export class AntigravityError extends Data.TaggedError('AntigravityError')<{
  readonly message: string;
  readonly cause?: unknown;
}> {}
