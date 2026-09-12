import {
  Duration,
  Effect,
  Layer,
  PubSub,
  Stream,
  SubscriptionRef,
} from 'effect';
import type { EventTemplate } from 'nostr-tools/core';
import { SimplePool } from 'nostr-tools/pool';
import { finalizeEvent, generateSecretKey } from 'nostr-tools/pure';
import { normalizeURL } from 'nostr-tools/utils';
import type { NegotiationEnvelope } from '../../negotiation/index.js';
import type { PeerId } from '../../peer-identity/index.js';
import {
  type IncomingNegotiation,
  Signaling,
  SignalingError,
  type SignalingConnection,
  type SignalingEvent,
  type SignalingStatus,
} from '../signaling.js';
import { kind, makeEvent, readEvent } from './event.js';

const statusOf = (connected: number, configured: number): SignalingStatus =>
  connected === 0
    ? { _tag: 'Unavailable', configured }
    : connected === configured
      ? { _tag: 'Available', connected, configured }
      : { _tag: 'Degraded', connected, configured };

/** A multi-relay Nostr Signaling provider using ephemeral plaintext events. */
export const layer = (options: {
  readonly relays: ReadonlyArray<string>;
  readonly namespace?: string;
  readonly relayOpenTimeout?: Duration.Input;
  readonly eventMaxAge?: Duration.Input;
}): Layer.Layer<Signaling> =>
  Layer.effect(
    Signaling,
    Effect.gen(function* () {
      if (options.relays.length === 0) {
        return yield* Effect.die(
          new Error('Nostr signaling requires a relay URL'),
        );
      }
      const relays = [...new Set(options.relays.map(normalizeURL))];
      const namespace = options.namespace ?? 'effect-webrtc';
      const openTimeout = Duration.toMillis(
        Duration.fromInputUnsafe(options.relayOpenTimeout ?? '10 seconds'),
      );
      const maxAgeSeconds = Math.ceil(
        Duration.toMillis(
          Duration.fromInputUnsafe(options.eventMaxAge ?? '30 seconds'),
        ) / 1000,
      );

      return Signaling.of({
        open: (self) =>
          Effect.gen(function* () {
            const secretKey = generateSecretKey();
            const pool = new SimplePool({
              enablePing: true,
              enableReconnect: true,
            });
            const incoming = yield* PubSub.unbounded<IncomingNegotiation>();
            const events = yield* PubSub.unbounded<SignalingEvent>();
            const status = yield* SubscriptionRef.make<SignalingStatus>({
              _tag: 'Connecting',
              configured: relays.length,
            });
            const signAuth = async (template: EventTemplate) =>
              finalizeEvent(template, secretKey);
            const seen = new Map<string, number>();

            yield* Effect.addFinalizer(() =>
              Effect.sync(() => {
                pool.destroy();
              }).pipe(
                Effect.andThen(PubSub.shutdown(incoming)),
                Effect.andThen(PubSub.shutdown(events)),
              ),
            );

            const connect = (relay: string) =>
              Effect.tryPromise({
                try: () =>
                  pool.ensureRelay(relay, { connectionTimeout: openTimeout }),
                catch: (cause) =>
                  new SignalingError({ operation: 'open', cause }),
              }).pipe(
                Effect.tap(() =>
                  Effect.sync(() => {
                    PubSub.publishUnsafe(events, {
                      _tag: 'RelayConnected',
                      relay,
                    });
                  }),
                ),
              );

            yield* Effect.raceAll(relays.map(connect));

            let previousStatuses = pool.listConnectionStatus();
            const refreshStatus = Effect.sync(() => {
              const statuses = pool.listConnectionStatus();
              for (const relay of relays) {
                const before = previousStatuses.get(relay) === true;
                const after = statuses.get(relay) === true;
                if (before !== after) {
                  PubSub.publishUnsafe(events, {
                    _tag: after ? 'RelayConnected' : 'RelayDisconnected',
                    relay,
                  });
                }
              }
              previousStatuses = statuses;
              const connected = relays.filter(
                (relay) => statuses.get(relay) === true,
              ).length;
              return connected;
            }).pipe(
              Effect.flatMap((connected) =>
                SubscriptionRef.set(status, statusOf(connected, relays.length)),
              ),
              Effect.delay('1 second'),
              Effect.forever,
            );
            yield* refreshStatus.pipe(
              Effect.forkScoped({ startImmediately: true }),
            );

            const subscription = pool.subscribeMany(
              relays,
              { kinds: [kind], '#d': [namespace], '#t': [self] },
              {
                onauth: signAuth,
                onevent: (event) => {
                  try {
                    const now = Math.floor(Date.now() / 1000);
                    if (event.kind !== kind)
                      throw new Error('Unexpected event kind');
                    if (
                      !event.tags.some(
                        ([name, value]) => name === 'd' && value === namespace,
                      ) ||
                      !event.tags.some(
                        ([name, value]) => name === 't' && value === self,
                      )
                    ) {
                      throw new Error('Event is addressed to another Peer');
                    }
                    if (seen.has(event.id)) return;
                    seen.set(event.id, now);
                    for (const [id, receivedAt] of seen) {
                      if (receivedAt < now - maxAgeSeconds) seen.delete(id);
                    }
                    const decoded = readEvent(event, now, maxAgeSeconds);
                    PubSub.publishUnsafe(incoming, {
                      sender: decoded.sender,
                      envelope: decoded.envelope,
                    });
                  } catch (error) {
                    PubSub.publishUnsafe(events, {
                      _tag: 'RejectedEvent',
                      reason: String(error),
                    });
                  }
                },
              },
            );
            yield* Effect.addFinalizer(() =>
              Effect.sync(() => subscription.close()),
            );

            const send = (recipient: PeerId, envelope: NegotiationEnvelope) =>
              Effect.tryPromise({
                try: () =>
                  Promise.any(
                    pool.publish(
                      relays,
                      makeEvent({
                        namespace,
                        sender: self,
                        recipient,
                        envelope,
                        secretKey,
                        maxAgeSeconds,
                      }),
                      { onauth: signAuth },
                    ),
                  ).then(() => undefined),
                catch: (cause) =>
                  new SignalingError({ operation: 'send', cause }),
              });

            return {
              peerId: self,
              send,
              incoming: Stream.fromPubSub(incoming),
              status: SubscriptionRef.changes(status),
              events: Stream.fromPubSub(events),
            } satisfies SignalingConnection;
          }),
      });
    }),
  );
