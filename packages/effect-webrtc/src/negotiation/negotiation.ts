import { Schema } from 'effect';
import { FlowCarrierSchema } from '@pkishorez/effect-tracer/flow';

export const PeerSessionId = Schema.String.pipe(
  Schema.brand('effect-webrtc/PeerSessionId'),
);

export type PeerSessionId = typeof PeerSessionId.Type;

export const ConnectionAttemptId = Schema.String.pipe(
  Schema.brand('effect-webrtc/ConnectionAttemptId'),
);

export type ConnectionAttemptId = typeof ConnectionAttemptId.Type;

const Offer = Schema.Struct({
  _tag: Schema.Literal('Offer'),
  description: Schema.String,
});

const Answer = Schema.Struct({
  _tag: Schema.Literal('Answer'),
  description: Schema.String,
});

const IceCandidate = Schema.Struct({
  _tag: Schema.Literal('IceCandidate'),
  candidate: Schema.String,
  sdpMid: Schema.NullOr(Schema.String),
  sdpMLineIndex: Schema.NullOr(Schema.Number),
  usernameFragment: Schema.NullOr(Schema.String),
});

const IceCandidatesComplete = Schema.Struct({
  _tag: Schema.Literal('IceCandidatesComplete'),
});

const Close = Schema.Struct({
  _tag: Schema.Literal('Close'),
});

/** Messages exchanged through Signaling while establishing an RTC Connection. */
export const NegotiationMessage = Schema.Union([
  Offer,
  Answer,
  IceCandidate,
  IceCandidatesComplete,
  Close,
]);

export type NegotiationMessage = typeof NegotiationMessage.Type;

/** The addressed payload that lets the answering Peer continue the offerer's Flow. */
export const NegotiationEnvelope = Schema.Struct({
  peerSessionId: PeerSessionId,
  connectionAttemptId: ConnectionAttemptId,
  flow: FlowCarrierSchema,
  message: NegotiationMessage,
});

export type NegotiationEnvelope = typeof NegotiationEnvelope.Type;
