import { makeTraceRecorder } from '@pkishorez/effect-tracer/recorder';
import { Effect, Exit, Layer, ManagedRuntime, Scope, Stream } from 'effect';
import { PeerId, WebRtc } from 'effect-webrtc';
import { layer as browserPlatform } from 'effect-webrtc/platform/browser';
import { layer as memorySignaling } from 'effect-webrtc/signaling/memory';
import { Messages } from '../contract/index.ts';

type PeerName = 'Alice' | 'Bob';
type ConnectionStatus =
  | 'Disconnected'
  | 'Connecting'
  | 'Connected'
  | 'Reconnecting';
type Delivery = 'pending' | 'delivered' | 'failed';

interface Message {
  readonly id: string;
  readonly author: PeerName;
  readonly text: string;
  readonly delivery: Delivery;
}

interface PeerSnapshot {
  readonly name: PeerName;
  readonly status: ConnectionStatus;
  readonly messages: ReadonlyArray<Message>;
  readonly error: string | null;
}

export interface ConversationSnapshot {
  readonly Alice: PeerSnapshot;
  readonly Bob: PeerSnapshot;
}

export interface ConversationRuntime {
  readonly recorder: ReturnType<typeof makeTraceRecorder>;
  readonly getSnapshot: () => ConversationSnapshot;
  readonly subscribe: (listener: () => void) => () => void;
  readonly connect: (initiator: PeerName) => void;
  readonly disconnect: (initiator: PeerName) => void;
  readonly send: (author: PeerName, text: string) => void;
  readonly dispose: () => Promise<void>;
}

const other = (name: PeerName): PeerName =>
  name === 'Alice' ? 'Bob' : 'Alice';

const initialPeer = (name: PeerName): PeerSnapshot => ({
  name,
  status: 'Disconnected',
  messages: [],
  error: null,
});

export const bootConversation = async (): Promise<ConversationRuntime> => {
  const recorder = makeTraceRecorder();
  const managed = ManagedRuntime.make(
    Layer.mergeAll(memorySignaling, browserPlatform, recorder.layer),
  );
  const scope = Effect.runSync(Scope.make());
  const runScoped = <A, E>(effect: Effect.Effect<A, E, Scope.Scope>) =>
    managed.runPromise(Effect.provideService(effect, Scope.Scope, scope));
  const run = <A, E>(effect: Effect.Effect<A, E>) =>
    managed.runPromise(effect).catch(() => undefined);
  const listeners = new Set<() => void>();
  let snapshot: ConversationSnapshot = {
    Alice: initialPeer('Alice'),
    Bob: initialPeer('Bob'),
  };
  const change = (
    update: (current: ConversationSnapshot) => ConversationSnapshot,
  ) =>
    Effect.sync(() => {
      snapshot = update(snapshot);
      for (const listener of listeners) listener();
    });
  const patchPeer = (
    name: PeerName,
    update: (peer: PeerSnapshot) => PeerSnapshot,
  ) => change((current) => ({ ...current, [name]: update(current[name]) }));
  const setBoth = (status: ConnectionStatus, error: string | null = null) =>
    change((current) => ({
      Alice: { ...current.Alice, status, error },
      Bob: { ...current.Bob, status, error },
    }));

  const receive = (recipient: PeerName) =>
    Messages.toLayer({
      SendMessage: ({ id, text }) =>
        patchPeer(recipient, (peer) => ({
          ...peer,
          messages: [
            ...peer.messages,
            { id, author: other(recipient), text, delivery: 'delivered' },
          ],
        })).pipe(Effect.as({ id })),
    });

  const aliceId = PeerId.make('demo-alice');
  const bobId = PeerId.make('demo-bob');
  const alice = await managed.runPromise(
    WebRtc.make({
      id: aliceId,
      serve: { contract: Messages, handlers: receive('Alice') },
    }).pipe(Effect.provideService(Scope.Scope, scope)),
  );
  const bob = await managed.runPromise(
    WebRtc.make({
      id: bobId,
      serve: { contract: Messages, handlers: receive('Bob') },
    }).pipe(Effect.provideService(Scope.Scope, scope)),
  );
  type Remote = Effect.Success<ReturnType<typeof alice.connect>>;
  const remotes: Partial<Record<PeerName, Remote>> = {};
  let connectionWanted = false;

  const watch = (name: PeerName, remote: Remote) =>
    Stream.runForEach(remote.status, (status) =>
      patchPeer(name, (peer) => ({
        ...peer,
        status:
          status._tag === 'Connected'
            ? 'Connected'
            : status._tag === 'Connecting'
              ? peer.status === 'Connected'
                ? 'Reconnecting'
                : 'Connecting'
              : connectionWanted
                ? 'Reconnecting'
                : 'Disconnected',
      })),
    ).pipe(Effect.forkScoped({ startImmediately: true }), Effect.asVoid);

  await runScoped(
    Effect.all(
      [
        alice.onRemotePeer((remote) =>
          Effect.sync(() => {
            remotes.Alice = remote;
          }).pipe(Effect.andThen(watch('Alice', remote))),
        ),
        bob.onRemotePeer((remote) =>
          Effect.sync(() => {
            remotes.Bob = remote;
          }).pipe(Effect.andThen(watch('Bob', remote))),
        ),
      ],
      { concurrency: 'unbounded' },
    ).pipe(Effect.forkScoped({ startImmediately: true }), Effect.asVoid),
  );

  const ids = { Alice: aliceId, Bob: bobId } as const;
  const peers = { Alice: alice, Bob: bob } as const;

  return {
    recorder,
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    connect: (initiator) => {
      connectionWanted = true;
      void runScoped(
        setBoth('Connecting').pipe(
          Effect.andThen(
            peers[initiator].connect({ id: ids[other(initiator)] }),
          ),
          Effect.tap((remote) =>
            Effect.sync(() => {
              remotes[initiator] = remote;
            }),
          ),
          Effect.andThen(setBoth('Connected')),
          Effect.catch((error) =>
            Effect.sync(() => {
              connectionWanted = false;
            }).pipe(
              Effect.andThen(setBoth('Disconnected', String(error))),
              Effect.asVoid,
            ),
          ),
        ),
      );
    },
    disconnect: (initiator) => {
      connectionWanted = false;
      void run(
        peers[initiator].disconnect(ids[other(initiator)]).pipe(
          Effect.tap(() =>
            Effect.sync(() => {
              delete remotes.Alice;
              delete remotes.Bob;
            }),
          ),
          Effect.andThen(setBoth('Disconnected')),
        ),
      );
    },
    send: (author, raw) => {
      const text = raw.trim();
      const remote = remotes[author];
      if (text.length === 0 || text.length > 500 || remote === undefined)
        return;
      const id = crypto.randomUUID();
      void run(
        patchPeer(author, (peer) => ({
          ...peer,
          messages: [
            ...peer.messages,
            { id, author, text, delivery: 'pending' },
          ],
        })).pipe(
          Effect.andThen(remote.rpc.SendMessage({ id, text })),
          Effect.andThen(
            patchPeer(author, (peer) => ({
              ...peer,
              messages: peer.messages.map((message) =>
                message.id === id
                  ? { ...message, delivery: 'delivered' }
                  : message,
              ),
            })),
          ),
          Effect.catch(() =>
            patchPeer(author, (peer) => ({
              ...peer,
              messages: peer.messages.map((message) =>
                message.id === id
                  ? { ...message, delivery: 'failed' }
                  : message,
              ),
            })),
          ),
        ),
      );
    },
    dispose: async () => {
      await managed.runPromise(Scope.close(scope, Exit.void));
      await managed.dispose();
    },
  };
};
