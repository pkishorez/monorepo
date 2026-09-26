import { Effect, type Stream } from 'effect';
import { RpcClient } from 'effect/unstable/rpc';
import type { Entity } from 'std-toolkit/core';
import {
  createStdSync,
  syncStrategy,
  type StdSyncPlatform,
  type SyncedCollection,
} from 'std-toolkit/sync';
import type { Message, Thread } from '../../runtime/table/index.js';
import { MessageSchema, ThreadSchema } from '../../runtime/table/index.js';
import { AiPlaygroundServerRpc } from '../contract/index.js';

const makeApi = () => RpcClient.make(AiPlaygroundServerRpc);

export type AiPlaygroundApi = Effect.Success<ReturnType<typeof makeApi>>;

export type KeepSubscribed = <A, E, R>(
  subscribe: () => Stream.Stream<A, E, R>,
) => Stream.Stream<A, E, R>;

export interface PlaygroundSyncOptions {
  readonly api: AiPlaygroundApi;
  readonly keepSubscribed: KeepSubscribed;
  readonly name: string;
  readonly platform?: StdSyncPlatform;
}

export interface PlaygroundSync {
  readonly threads: SyncedCollection<Thread>;
  readonly messages: SyncedCollection<Message>;
  readonly dispose: () => Promise<void>;
}

export const makePlaygroundSync = ({
  api,
  keepSubscribed,
  name,
  platform,
}: PlaygroundSyncOptions): PlaygroundSync => {
  const std = createStdSync({
    name,
    ...(platform === undefined ? {} : { platform }),
  });
  const liveOldToNew = <T extends object>(
    subscribe: (
      cursor: Entity<T> | null,
    ) => Stream.Stream<ReadonlyArray<Entity<T>>, unknown>,
  ) => ({
    strategy: syncStrategy.oldToNew<T>({
      source: ({ live }) =>
        live({
          open: ({ cursor }) => keepSubscribed(() => subscribe(cursor)),
        }),
    }),
  });

  const threads = std.collection({
    schema: ThreadSchema,
    sync: {
      total: liveOldToNew<Thread>((cursor) =>
        api.subscribeThreads({ '>': cursor }),
      ),
    },
  });

  const messages = std.collection({
    schema: MessageSchema,
    sync: {
      partitions: {
        threadId: (threadId) =>
          liveOldToNew<Message>((cursor) =>
            api.subscribeMessages({ threadId, '>': cursor }),
          ),
      },
    },
  });

  return { threads, messages, dispose: () => std.dispose() };
};
