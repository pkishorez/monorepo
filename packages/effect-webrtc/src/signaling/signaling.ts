import { Context, Data, Effect, Stream } from 'effect';
import type { Scope } from 'effect/Scope';
import {
  NegotiationEnvelope,
  NegotiationMessage,
} from '../negotiation/index.js';
import type { NegotiationEnvelope as Envelope } from '../negotiation/index.js';
import { PeerId } from '../peer-identity/index.js';
import type { PeerId as PeerIdentifier } from '../peer-identity/index.js';

export { NegotiationEnvelope, NegotiationMessage, PeerId };
export type { Envelope, PeerIdentifier };

export class PeerIdInUse extends Data.TaggedError('PeerIdInUse')<{
  readonly peerId: PeerIdentifier;
}> {}

export class PeerUnavailable extends Data.TaggedError('PeerUnavailable')<{
  readonly peerId: PeerIdentifier;
}> {}

export class SignalingError extends Data.TaggedError('SignalingError')<{
  readonly operation: 'open' | 'receive' | 'send';
  readonly cause: unknown;
}> {}

export interface IncomingNegotiation {
  readonly sender: PeerIdentifier;
  readonly envelope: Envelope;
}

/** One Peer's scoped connection to a Signaling provider. */
export interface SignalingConnection {
  readonly peerId: PeerIdentifier;
  readonly send: (
    recipient: PeerIdentifier,
    envelope: Envelope,
  ) => Effect.Effect<void, PeerUnavailable | SignalingError>;
  readonly incoming: Stream.Stream<IncomingNegotiation, SignalingError>;
}

interface SignalingService {
  readonly open: (
    self: PeerIdentifier,
  ) => Effect.Effect<SignalingConnection, PeerIdInUse | SignalingError, Scope>;
}

/** Provider-agnostic exchange of addressed WebRTC negotiation messages. */
export class Signaling extends Context.Service<Signaling, SignalingService>()(
  'effect-webrtc/Signaling',
) {}
