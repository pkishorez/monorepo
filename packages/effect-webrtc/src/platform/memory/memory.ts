import { Effect, Layer, Queue, Stream, SubscriptionRef } from 'effect';
import {
  type RtcConnection,
  type RtcDataChannel,
  RtcError,
  WebRtcPlatform,
} from '../platform.js';

interface MemoryDataChannel extends RtcDataChannel {
  remote?: MemoryDataChannel;
  readonly inbox: Queue.Queue<Uint8Array>;
}

interface MemoryConnection extends RtcConnection {
  remote?: MemoryConnection;
  offerToken?: string;
  readonly incomingChannels: Queue.Queue<RtcDataChannel>;
  readonly pendingChannels: MemoryDataChannel[];
  readonly stateRef: SubscriptionRef.SubscriptionRef<
    'new' | 'connecting' | 'connected' | 'closed'
  >;
}

const dataChannel = Effect.gen(function* () {
  const inbox = yield* Queue.unbounded<Uint8Array>();
  const channel: MemoryDataChannel = {
    inbox,
    send: (payload) =>
      channel.remote === undefined
        ? Effect.fail(
            new RtcError({
              operation: 'send',
              cause: 'The memory data channel is not paired',
            }),
          )
        : Queue.offer(channel.remote.inbox, payload.slice()).pipe(
            Effect.asVoid,
          ),
    incoming: Stream.fromQueue(inbox),
    close: Queue.shutdown(inbox),
  };
  return channel;
});

/** A process-local Platform that performs no networking. */
export const layer: Layer.Layer<WebRtcPlatform> = Layer.effect(
  WebRtcPlatform,
  Effect.sync(() => {
    let nextOffer = 0;
    const offers = new Map<string, MemoryConnection>();
    const answers = new Map<string, MemoryConnection>();

    const pairDataChannel = (
      owner: MemoryConnection,
      local: MemoryDataChannel,
    ) =>
      Effect.gen(function* () {
        const remote = owner.remote;
        if (remote === undefined) return;
        const counterpart = yield* dataChannel;
        local.remote = counterpart;
        counterpart.remote = local;
        yield* Queue.offer(remote.incomingChannels, counterpart);
      });

    const pairConnections = (left: MemoryConnection, right: MemoryConnection) =>
      Effect.gen(function* () {
        left.remote = right;
        right.remote = left;
        yield* SubscriptionRef.set(left.stateRef, 'connected');
        yield* SubscriptionRef.set(right.stateRef, 'connected');
        yield* Effect.forEach(left.pendingChannels, (channel) =>
          pairDataChannel(left, channel),
        );
        yield* Effect.forEach(right.pendingChannels, (channel) =>
          pairDataChannel(right, channel),
        );
      });

    const makeConnection = () =>
      Effect.gen(function* () {
        const incomingChannels = yield* Queue.unbounded<RtcDataChannel>();
        const stateRef = yield* SubscriptionRef.make<
          'new' | 'connecting' | 'connected' | 'closed'
        >('new');

        const connection: MemoryConnection = {
          incomingChannels,
          pendingChannels: [],
          stateRef,
          state: SubscriptionRef.changes(stateRef),
          localIceCandidates: Stream.empty,
          incomingDataChannels: Stream.fromQueue(incomingChannels),
          createOffer: () =>
            Effect.gen(function* () {
              const token = String(++nextOffer);
              connection.offerToken = token;
              offers.set(token, connection);
              yield* SubscriptionRef.set(stateRef, 'connecting');
              return `memory-offer:${token}`;
            }),
          acceptOffer: (offer) =>
            Effect.gen(function* () {
              const token = offer.replace(/^memory-offer:/, '');
              const offerer = offers.get(token);
              if (offerer === undefined) {
                return yield* new RtcError({
                  operation: 'accept-offer',
                  cause: `Unknown memory offer ${JSON.stringify(offer)}`,
                });
              }
              connection.remote = offerer;
              answers.set(token, connection);
              yield* SubscriptionRef.set(stateRef, 'connecting');
              return `memory-answer:${token}`;
            }),
          acceptAnswer: (answer) =>
            Effect.gen(function* () {
              const token = answer.replace(/^memory-answer:/, '');
              const answerer = answers.get(token);
              if (connection.offerToken !== token || answerer === undefined) {
                return yield* new RtcError({
                  operation: 'accept-answer',
                  cause: `Unknown memory answer ${JSON.stringify(answer)}`,
                });
              }
              offers.delete(token);
              answers.delete(token);
              yield* pairConnections(connection, answerer);
            }),
          addIceCandidate: () => Effect.void,
          completeIceCandidates: Effect.void,
          openDataChannel: Effect.gen(function* () {
            const channel = yield* dataChannel;
            connection.pendingChannels.push(channel);
            if (connection.remote !== undefined) {
              yield* pairDataChannel(connection, channel);
            }
            return channel;
          }),
          close: Effect.gen(function* () {
            if (connection.offerToken !== undefined) {
              offers.delete(connection.offerToken);
              answers.delete(connection.offerToken);
            }
            yield* SubscriptionRef.set(stateRef, 'closed');
            yield* Queue.shutdown(incomingChannels);
          }),
        };

        yield* Effect.addFinalizer(() => Effect.orDie(connection.close));
        return connection;
      });

    return { makeConnection };
  }),
);
