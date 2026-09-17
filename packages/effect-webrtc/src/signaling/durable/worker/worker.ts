import type * as cf from '@cloudflare/workers-types';
import {
  Context,
  Effect,
  Option,
  PubSub,
  Ref,
  Result,
  Schema,
  Stream,
} from 'effect';
import type * as Cloudflare from 'alchemy/Cloudflare';
import { verifyRequest } from 'auth-toolkit/server';
import { isTrustedOrigin, validateTrustedOrigins } from 'auth-toolkit/worker';
import type { ConnectionSlot } from 'rpc-toolkit/rpc/cloudflare/hibernating-rpc';
import { HttpServerRequest, HttpServerResponse } from 'effect/unstable/http';
import {
  ConnectionMetadata,
  DurableSignalingRpcs,
  type IncomingNegotiation,
  NegotiationTooLarge,
  type PeerDescriptor,
  TooManyPeerWaits,
} from '../rpc/index.js';

const MAX_PEERS_PER_USER = 64;
const MAX_WAITS_PER_CONNECTION = 16;
const MAX_NEGOTIATION_BYTES = 64 * 1024;

const DurableConnectionSchema = Schema.Struct({
  userId: Schema.String,
  peerId: ConnectionMetadata.fields.peerId,
  name: ConnectionMetadata.fields.name,
  mode: ConnectionMetadata.fields.mode,
  connectionId: Schema.String,
});

export type DurableConnection = typeof DurableConnectionSchema.Type;

export type RequestValue<A> = A | ((request: Request) => A);

const resolveRequestValue = <A>(value: RequestValue<A>, request: Request): A =>
  typeof value === 'function'
    ? (value as (request: Request) => A)(request)
    : value;

const ConnectionContext = Context.Reference<DurableConnection>(
  'effect-webrtc/DurableConnection',
  {
    defaultValue: () => {
      throw new Error('Durable signaling RPC called without a connection');
    },
  },
);

const reject = (status: number) =>
  Effect.fail(HttpServerResponse.empty({ status }));

const decodeAttachment = Schema.decodeUnknownOption(DurableConnectionSchema);

const connectionFromSocket = (socket: cf.WebSocket) => {
  const attachment = socket.deserializeAttachment() as {
    readonly connection?: unknown;
  } | null;
  return decodeAttachment(attachment?.connection).pipe(Option.getOrUndefined);
};

export const durableSignalingConnection = (
  options: {
    readonly authWorkerUrl: RequestValue<string>;
    readonly trustedOrigins: RequestValue<ReadonlyArray<string>>;
  },
  state: Cloudflare.DurableObjectState['Service'],
): ConnectionSlot<DurableConnection> => ({
  tag: ConnectionContext,
  schema: DurableConnectionSchema,
  initial: (serverRequest) =>
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.toWeb(serverRequest).pipe(
        Effect.mapError(() => HttpServerResponse.empty({ status: 400 })),
      );
      const trustedOrigins = resolveRequestValue(
        options.trustedOrigins,
        request,
      );
      validateTrustedOrigins(trustedOrigins);
      const origin = request.headers.get('origin');
      if (origin === null || !isTrustedOrigin(origin, trustedOrigins)) {
        return yield* reject(403);
      }

      const url = new URL(request.url);
      const metadata = yield* Schema.decodeUnknownEffect(ConnectionMetadata)({
        peerId: url.searchParams.get('peerId'),
        name: url.searchParams.get('name'),
        mode: url.searchParams.get('mode'),
      }).pipe(Effect.mapError(() => HttpServerResponse.empty({ status: 400 })));

      const verified = yield* Effect.tryPromise(() =>
        verifyRequest({
          authWorkerUrl: resolveRequestValue(options.authWorkerUrl, request),
          request,
        }),
      ).pipe(Effect.mapError(() => HttpServerResponse.empty({ status: 503 })));
      if (verified === null) return yield* reject(401);

      const connections = state.raw
        .getWebSockets()
        .map(connectionFromSocket)
        .filter((value): value is DurableConnection => value !== undefined);
      const peers = new Set(
        connections
          .filter(({ userId }) => userId === verified.user.id)
          .map(({ peerId }) => peerId),
      );
      if (!peers.has(metadata.peerId) && peers.size >= MAX_PEERS_PER_USER) {
        return yield* reject(429);
      }

      for (const socket of state.raw.getWebSockets()) {
        const existing = connectionFromSocket(socket);
        if (
          existing?.userId === verified.user.id &&
          existing.peerId === metadata.peerId
        ) {
          socket.close(4000, 'Peer replaced by a newer connection');
        }
      }

      return {
        ...metadata,
        userId: verified.user.id,
        connectionId: crypto.randomUUID(),
      };
    }),
});

interface Entry {
  readonly connection: DurableConnection;
  readonly inbox: PubSub.PubSub<IncomingNegotiation>;
}

const descriptor = ({
  peerId,
  name,
  mode,
}: DurableConnection): PeerDescriptor => ({ peerId, name, mode });

const comparePeers = (left: PeerDescriptor, right: PeerDescriptor) =>
  left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }) ||
  left.peerId.localeCompare(right.peerId);

export const durableSignalingHandlers = Effect.gen(function* () {
  const entries = yield* Ref.make(new Map<string, Entry>());
  const changes = yield* PubSub.unbounded<void>({ replay: 1 });
  const waits = yield* Ref.make(new Map<string, number>());
  let debugInstanceValue = 0;

  const keyOf = ({ userId, peerId }: DurableConnection) =>
    `${userId}\u0000${peerId}`;

  const register = (entry: Entry) =>
    Ref.update(entries, (current) => {
      const next = new Map(current);
      next.set(keyOf(entry.connection), entry);
      return next;
    }).pipe(Effect.andThen(PubSub.publish(changes, undefined)));

  const unregister = (connection: DurableConnection) =>
    Ref.update(entries, (current) => {
      const key = keyOf(connection);
      if (
        current.get(key)?.connection.connectionId !== connection.connectionId
      ) {
        return current;
      }
      const next = new Map(current);
      next.delete(key);
      return next;
    }).pipe(Effect.andThen(PubSub.publish(changes, undefined)), Effect.asVoid);

  const list = (self: DurableConnection) =>
    Ref.get(entries).pipe(
      Effect.map((current) =>
        [...current.values()]
          .filter(
            ({ connection }) =>
              connection.userId === self.userId &&
              connection.peerId !== self.peerId,
          )
          .map(({ connection }) => descriptor(connection))
          .sort(comparePeers),
      ),
    );

  const findConnectable = (self: DurableConnection, peerId: string) =>
    Ref.get(entries).pipe(
      Effect.map((current) => current.get(`${self.userId}\u0000${peerId}`)),
      Effect.map((entry) =>
        entry?.connection.mode === 'Connectable' &&
        entry.connection.peerId !== self.peerId
          ? Option.some(descriptor(entry.connection))
          : Option.none(),
      ),
    );

  return DurableSignalingRpcs.toLayer({
    DebugInstanceValue: () => Effect.sync(() => debugInstanceValue++),
    SubscribePeers: () =>
      Stream.unwrap(
        Effect.gen(function* () {
          const self = yield* ConnectionContext;
          return Stream.concat(
            Stream.make(undefined),
            Stream.fromPubSub(changes),
          ).pipe(Stream.mapEffect(() => list(self)));
        }),
      ),
    WaitForPeer: ({ peerId }) =>
      Stream.unwrap(
        Effect.gen(function* () {
          const self = yield* ConnectionContext;
          const accepted = yield* Ref.modify(waits, (current) => {
            const count = current.get(self.connectionId) ?? 0;
            if (count >= MAX_WAITS_PER_CONNECTION) return [false, current];
            const next = new Map(current);
            next.set(self.connectionId, count + 1);
            return [true, next];
          });
          if (!accepted) return Stream.fail(new TooManyPeerWaits());

          const release = Ref.update(waits, (current) => {
            const next = new Map(current);
            const count = (next.get(self.connectionId) ?? 1) - 1;
            if (count === 0) next.delete(self.connectionId);
            else next.set(self.connectionId, count);
            return next;
          });
          return Stream.concat(
            Stream.make(undefined),
            Stream.fromPubSub(changes),
          ).pipe(
            Stream.mapEffect(() => findConnectable(self, peerId)),
            Stream.filterMap((peer) =>
              Result.fromOption(peer, () => undefined),
            ),
            Stream.take(1),
            Stream.ensuring(release),
          );
        }),
      ),
    ReceiveNegotiations: () =>
      Stream.unwrap(
        Effect.gen(function* () {
          const connection = yield* ConnectionContext;
          const inbox = yield* PubSub.unbounded<IncomingNegotiation>();
          yield* register({ connection, inbox });
          return Stream.fromPubSub(inbox).pipe(
            Stream.ensuring(unregister(connection)),
          );
        }),
      ),
    SendNegotiation: ({ recipient, envelope }) =>
      Effect.gen(function* () {
        if (
          new TextEncoder().encode(JSON.stringify(envelope)).byteLength >
          MAX_NEGOTIATION_BYTES
        ) {
          return yield* new NegotiationTooLarge();
        }
        const self = yield* ConnectionContext;
        const target = (yield* Ref.get(entries)).get(
          `${self.userId}\u0000${recipient}`,
        );
        if (
          target === undefined ||
          recipient === self.peerId ||
          (envelope.message._tag === 'Offer' &&
            target.connection.mode === 'Private')
        ) {
          return;
        }
        yield* PubSub.publish(target.inbox, {
          sender: self.peerId,
          envelope,
        });
      }),
  });
});
