import { Effect, Layer, PubSub, Stream } from 'effect';
import type { NegotiationEnvelope } from '../../negotiation/index.js';
import type { PeerId } from '../../peer-identity/index.js';
import {
  type IncomingNegotiation,
  PeerIdInUse,
  PeerUnavailable,
  Signaling,
  type SignalingConnection,
} from '../signaling.js';

/** A scoped, process-local Signaling provider for contract tests. */
export const layer: Layer.Layer<Signaling> = Layer.effect(
  Signaling,
  Effect.sync(() => {
    const peers = new Map<PeerId, PubSub.PubSub<IncomingNegotiation>>();

    const open = (self: PeerId) =>
      Effect.gen(function* () {
        const inbox = yield* PubSub.unbounded<IncomingNegotiation>();

        yield* Effect.acquireRelease(
          Effect.suspend(() => {
            if (peers.has(self)) {
              return Effect.fail(new PeerIdInUse({ peerId: self }));
            }
            peers.set(self, inbox);
            return Effect.void;
          }),
          () =>
            Effect.sync(() => {
              if (peers.get(self) === inbox) peers.delete(self);
            }).pipe(Effect.andThen(PubSub.shutdown(inbox))),
        );

        const send = (recipient: PeerId, envelope: NegotiationEnvelope) =>
          Effect.suspend(() => {
            const recipientInbox = peers.get(recipient);
            return recipientInbox === undefined
              ? Effect.fail(new PeerUnavailable({ peerId: recipient }))
              : PubSub.publish(recipientInbox, { sender: self, envelope }).pipe(
                  Effect.asVoid,
                );
          });

        return {
          peerId: self,
          send,
          incoming: Stream.fromPubSub(inbox),
          status: Stream.succeed({
            _tag: 'Available' as const,
            connected: 1,
            configured: 1,
          }),
          events: Stream.empty,
        } satisfies SignalingConnection;
      });

    return { open };
  }),
);
