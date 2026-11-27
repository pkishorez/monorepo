import { Context, Data, type Effect } from 'effect';
import type { Message } from '../../../rpc/agent/contract/index.js';

export class ThreadStoreError extends Data.TaggedError('ThreadStoreError')<{
  readonly message: string;
}> {}

export interface StoredThread {
  readonly id: string;
  readonly folder: string;
  readonly kind: string;
  readonly createdAt: number;
  readonly system: string | null;
  readonly mcp: boolean;
  readonly session: string | null;
}

export interface Saved {
  readonly thread: StoredThread;
  readonly messages: ReadonlyArray<Message>;
  readonly next: number;
}

export interface ThreadStoreShape {
  readonly all: () => Effect.Effect<ReadonlyArray<Saved>, ThreadStoreError>;
  readonly create: (
    thread: StoredThread,
  ) => Effect.Effect<void, ThreadStoreError>;
  readonly append: (
    thread: string,
    from: number,
    messages: ReadonlyArray<Message>,
  ) => Effect.Effect<void, ThreadStoreError>;
  readonly resumed: (
    thread: string,
    session: string,
  ) => Effect.Effect<void, ThreadStoreError>;
  readonly remove: (thread: string) => Effect.Effect<void, ThreadStoreError>;
}

export class ThreadStore extends Context.Service<
  ThreadStore,
  ThreadStoreShape
>()('Agent/server/ThreadStore') {}
