import { Effect, Fiber, Stream } from 'effect';
import type { PeerId } from 'effect-webrtc';
import {
  DurableSignaling,
  type DurableSignaling as DurableConnection,
  type PeerDescriptor,
  type PeerMode,
} from 'effect-webrtc/signaling/durable';
import {
  bootConversationWith,
  type ConversationRuntime,
  type DemoSnapshot,
} from '../../effect-webrtc/runtime/index.ts';

export interface DurableDemoSnapshot extends DemoSnapshot {
  readonly peers: ReadonlyArray<PeerDescriptor>;
  readonly directory: 'loading' | 'ready' | 'error';
}

export interface DurableConversationRuntime extends Omit<
  ConversationRuntime,
  'getSnapshot'
> {
  readonly getSnapshot: () => DurableDemoSnapshot;
  readonly probeInstance: () => Promise<number>;
}

export interface DurableConversationOptions {
  readonly peerId: PeerId;
  readonly name: string;
  readonly mode: PeerMode;
}

const signalingUrl = () => {
  const url = new URL('/api/durable-signaling', window.location.href);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
};

export const bootDurableConversation = async ({
  peerId,
  name,
  mode,
}: DurableConversationOptions): Promise<DurableConversationRuntime> => {
  let durable: DurableConnection | undefined;
  const conversation = await bootConversationWith({
    localId: peerId,
    initialSignaling: 'Connecting to your signaling server…',
    signaling: DurableSignaling.connect({
      url: signalingUrl(),
      peerId,
      name,
      mode,
    }).pipe(
      Effect.map((connection) => {
        durable = connection;
        return {
          layer: connection.signalingLayer,
          describeStatus: (
            status: 'Connecting' | 'Available' | 'Unavailable',
          ) =>
            status === 'Available'
              ? 'Durable signaling available'
              : status === 'Connecting'
                ? 'Connecting to your signaling server…'
                : 'Signaling server unavailable',
        };
      }),
    ),
  });
  if (durable === undefined) throw new Error('Durable signaling did not start');
  const connection = durable;
  const listeners = new Set<() => void>();
  let peers: ReadonlyArray<PeerDescriptor> = [];
  let directory: DurableDemoSnapshot['directory'] = 'loading';
  let snapshot: DurableDemoSnapshot = {
    ...conversation.getSnapshot(),
    peers,
    directory,
  };
  const notify = () => {
    snapshot = { ...conversation.getSnapshot(), peers, directory };
    listeners.forEach((listener) => listener());
  };
  const unsubscribeConversation = conversation.subscribe(notify);
  const peerSubscription = Effect.runFork(
    connection.peers.pipe(
      Stream.runForEach((next) =>
        Effect.sync(() => {
          peers = next;
          directory = 'ready';
          notify();
        }),
      ),
      Effect.catch(() =>
        Effect.sync(() => {
          directory = 'error';
          notify();
        }),
      ),
    ),
  );

  return {
    ...conversation,
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    probeInstance: () => Effect.runPromise(connection.debugInstanceValue),
    dispose: async () => {
      unsubscribeConversation();
      await Effect.runPromise(Fiber.interrupt(peerSubscription));
      await conversation.dispose();
    },
  };
};
