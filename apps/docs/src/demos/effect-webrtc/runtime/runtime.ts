import { makeTraceRecorder } from '@pkishorez/effect-tracer/recorder';
import { Effect, Exit, Layer, ManagedRuntime, Scope, Stream } from 'effect';
import {
  PeerId,
  WebRtc,
  type PeerSession,
  type SessionEvent,
  type SessionStatus,
} from 'effect-webrtc';
import { layer as browserPlatform } from 'effect-webrtc/platform/browser';
import { layer as nostrSignaling } from 'effect-webrtc/signaling/nostr';
import { Messages } from '../contract/index.ts';

type Delivery = 'pending' | 'delivered' | 'failed';

interface Message {
  readonly id: string;
  readonly author: string;
  readonly text: string;
  readonly delivery: Delivery;
}

interface ConversationSnapshot {
  readonly remoteId: string;
  readonly status: SessionStatus;
  readonly messages: ReadonlyArray<Message>;
  readonly activity: ReadonlyArray<string>;
}

interface DemoSnapshot {
  readonly localId: string;
  readonly signaling: string;
  readonly conversations: ReadonlyArray<ConversationSnapshot>;
}

export interface ConversationRuntime {
  readonly recorder: ReturnType<typeof makeTraceRecorder>;
  readonly getSnapshot: () => DemoSnapshot;
  readonly subscribe: (listener: () => void) => () => void;
  readonly connect: (remoteId: string) => void;
  readonly disconnect: (remoteId: string) => void;
  readonly send: (remoteId: string, text: string) => void;
  readonly dispose: () => Promise<void>;
}

const relayUrls = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.primal.net',
] as const;

const rtc = {
  iceServers: [
    {
      urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'],
    },
  ],
} as const;

const describeStatus = (status: SessionStatus) => {
  if (status._tag === 'Connected') return 'Connected';
  const phase = status.phase?.replaceAll('-', ' ') ?? 'waiting';
  return `${status._tag}: ${phase}`;
};

const describeEvent = (event: SessionEvent) => {
  switch (event._tag) {
    case 'IceStateChanged':
      return `ICE ${event.state}`;
    case 'SessionClosed':
      return `Session closed ${event.reason}`;
    default:
      return event._tag.replace(/([a-z])([A-Z])/g, '$1 $2');
  }
};

export const bootConversation = async (
  localId: string,
): Promise<ConversationRuntime> => {
  const recorder = makeTraceRecorder();
  const managed = ManagedRuntime.make(
    Layer.mergeAll(
      nostrSignaling({
        relays: relayUrls,
        namespace: 'effect-webrtc-demo',
      }),
      browserPlatform,
      recorder.layer,
    ),
  );
  const scope = Effect.runSync(Scope.make());
  const runScoped = <A, E>(effect: Effect.Effect<A, E, Scope.Scope>) =>
    managed.runPromise(Effect.provideService(effect, Scope.Scope, scope));
  const run = <A, E>(effect: Effect.Effect<A, E>) =>
    managed.runPromise(effect).catch(() => undefined);
  const listeners = new Set<() => void>();
  let snapshot: DemoSnapshot = {
    localId,
    signaling: 'Connecting to Nostr relays…',
    conversations: [],
  };

  const change = (update: (current: DemoSnapshot) => DemoSnapshot) =>
    Effect.sync(() => {
      snapshot = update(snapshot);
      for (const listener of listeners) listener();
    });
  const patchConversation = (
    remoteId: string,
    update: (conversation: ConversationSnapshot) => ConversationSnapshot,
  ) =>
    change((current) => ({
      ...current,
      conversations: current.conversations.map((conversation) =>
        conversation.remoteId === remoteId
          ? update(conversation)
          : conversation,
      ),
    }));
  const ensureConversation = (remoteId: string, status: SessionStatus) =>
    change((current) =>
      current.conversations.some(
        (conversation) => conversation.remoteId === remoteId,
      )
        ? current
        : current.conversations.length >= 20
          ? current
          : {
              ...current,
              conversations: [
                ...current.conversations,
                { remoteId, status, messages: [], activity: [] },
              ],
            },
    );

  const receive = Messages.toLayer({
    SendMessage: ({ author, id, text }) =>
      ensureConversation(author, {
        _tag: 'Connecting',
        role: 'Responder',
        phase: 'negotiating',
      }).pipe(
        Effect.andThen(
          patchConversation(author, (conversation) => ({
            ...conversation,
            messages: [
              ...conversation.messages,
              { id, author, text, delivery: 'delivered' },
            ],
          })),
        ),
        Effect.as({ id }),
      ),
  });

  const peer = await managed.runPromise(
    WebRtc.make({
      id: PeerId.make(localId),
      rtc,
      serve: { contract: Messages, handlers: receive },
    }).pipe(Effect.provideService(Scope.Scope, scope)),
  );
  type Remote = Effect.Success<ReturnType<typeof peer.connect>>;
  const remotes = new Map<string, Remote>();
  const watched = new Map<
    string,
    { readonly session: PeerSession; readonly scope: Scope.Closeable }
  >();

  const unwatch = (remoteId: string) =>
    Effect.suspend(() => {
      const entry = watched.get(remoteId);
      watched.delete(remoteId);
      remotes.delete(remoteId);
      return entry === undefined
        ? Effect.void
        : Scope.close(entry.scope, Exit.void);
    });

  const watchSession = (session: PeerSession) =>
    Effect.gen(function* () {
      const remoteId = String(session.remoteId);
      if (watched.get(remoteId)?.session === session) return;
      yield* unwatch(remoteId);
      const sessionScope = yield* Scope.make();
      watched.set(remoteId, { session, scope: sessionScope });
      yield* Stream.runForEach(session.status, (status) =>
        (status._tag === 'Connected'
          ? peer.getRemotePeer({ id: session.remoteId }).pipe(
              Effect.tap((remote) =>
                Effect.sync(() => remotes.set(remoteId, remote)),
              ),
              Effect.asVoid,
            )
          : Effect.void
        ).pipe(
          Effect.andThen(ensureConversation(remoteId, status)),
          Effect.andThen(
            patchConversation(remoteId, (conversation) => ({
              ...conversation,
              status,
              activity: [
                ...conversation.activity,
                describeStatus(status),
              ].slice(-100),
            })),
          ),
        ),
      ).pipe(Effect.forkIn(sessionScope, { startImmediately: true }));
      yield* Stream.runForEach(session.events, (event) =>
        patchConversation(remoteId, (conversation) => ({
          ...conversation,
          activity: [...conversation.activity, describeEvent(event)].slice(
            -100,
          ),
        })),
      ).pipe(Effect.forkIn(sessionScope, { startImmediately: true }));
    });

  await runScoped(
    Effect.all([
      Stream.runForEach(peer.sessions, (sessions) =>
        Effect.forEach(
          [...watched.keys()].filter(
            (remoteId) =>
              !sessions.some(
                (session) => String(session.remoteId) === remoteId,
              ),
          ),
          unwatch,
          { discard: true },
        ).pipe(
          Effect.andThen(
            Effect.forEach(sessions.slice(0, 20), watchSession, {
              discard: true,
            }),
          ),
          Effect.andThen(
            Effect.forEach(
              sessions.slice(20),
              (session) => peer.disconnect(session.remoteId),
              { discard: true },
            ),
          ),
        ),
      ),
      Stream.runForEach(peer.signalingStatus, (status) =>
        change((current) => ({
          ...current,
          signaling:
            status._tag === 'Connecting'
              ? 'Connecting to Nostr relays…'
              : status._tag === 'Unavailable'
                ? 'No Nostr relays available'
                : `${status.connected}/${status.configured} Nostr relays connected`,
        })),
      ),
    ]).pipe(Effect.forkScoped({ startImmediately: true }), Effect.asVoid),
  );

  return {
    recorder,
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    connect: (rawRemoteId) => {
      const remoteId = rawRemoteId.trim().toLowerCase();
      if (remoteId === localId || !/^[a-z0-9_-]{1,64}$/.test(remoteId)) return;
      void runScoped(
        peer
          .connect({ id: PeerId.make(remoteId) })
          .pipe(
            Effect.tap((remote) =>
              Effect.sync(() => remotes.set(remoteId, remote)),
            ),
          ),
      );
    },
    disconnect: (remoteId) => {
      void run(
        unwatch(remoteId).pipe(
          Effect.andThen(peer.disconnect(PeerId.make(remoteId))),
          Effect.andThen(
            change((current) => ({
              ...current,
              conversations: current.conversations.filter(
                (conversation) => conversation.remoteId !== remoteId,
              ),
            })),
          ),
        ),
      );
    },
    send: (remoteId, raw) => {
      const text = raw.trim();
      const remote = remotes.get(remoteId);
      if (remote === undefined || text.length === 0 || text.length > 500)
        return;
      const id = crypto.randomUUID();
      void run(
        patchConversation(remoteId, (conversation) => ({
          ...conversation,
          messages: [
            ...conversation.messages,
            { id, author: localId, text, delivery: 'pending' },
          ],
        })).pipe(
          Effect.andThen(
            Effect.suspend(() =>
              remote.rpc.SendMessage({ id, author: localId, text }),
            ),
          ),
          Effect.andThen(
            patchConversation(remoteId, (conversation) => ({
              ...conversation,
              messages: conversation.messages.map((message) =>
                message.id === id
                  ? { ...message, delivery: 'delivered' }
                  : message,
              ),
            })),
          ),
          Effect.catch(() =>
            patchConversation(remoteId, (conversation) => ({
              ...conversation,
              messages: conversation.messages.map((message) =>
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
      await managed.runPromise(
        Effect.forEach([...watched.keys()], unwatch, { discard: true }),
      );
      await managed.runPromise(Scope.close(scope, Exit.void));
      await managed.dispose();
    },
  };
};
