import { Data } from 'effect';

/** What went wrong in a Replica, said plainly: a Store that failed, an Instance that stopped. */
export class ReplicaError extends Data.TaggedError('ReplicaError')<{
  readonly message: string;
  readonly cause?: unknown;
}> {}
