import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/unstable/rpc';
import { NegotiationEnvelope } from '../../../negotiation/index.js';
import { PeerId } from '../../../peer-identity/index.js';

export const PeerMode = Schema.Literals(['Connectable', 'Private']);
export type PeerMode = typeof PeerMode.Type;

const DurablePeerId = PeerId.check(
  Schema.isLengthBetween(1, 128),
  Schema.isPattern(/^[A-Za-z0-9._:-]+$/),
);

const PeerName = Schema.String.check(
  Schema.isTrimmed(),
  Schema.isLengthBetween(1, 80),
);

export const PeerDescriptor = Schema.Struct({
  peerId: DurablePeerId,
  name: PeerName,
  mode: PeerMode,
});
export type PeerDescriptor = typeof PeerDescriptor.Type;

export const ConnectionMetadata = PeerDescriptor;
export type ConnectionMetadata = typeof ConnectionMetadata.Type;

export const IncomingNegotiation = Schema.Struct({
  sender: DurablePeerId,
  envelope: NegotiationEnvelope,
});
export type IncomingNegotiation = typeof IncomingNegotiation.Type;

export class TooManyPeerWaits extends Schema.TaggedError<TooManyPeerWaits>()(
  'TooManyPeerWaits',
  {},
) {}

export class NegotiationTooLarge extends Schema.TaggedError<NegotiationTooLarge>()(
  'NegotiationTooLarge',
  {},
) {}

export class DurableSignalingRpcs extends RpcGroup.make(
  Rpc.make('ListPeers', {
    success: Schema.Array(PeerDescriptor),
  }),
  Rpc.make('WaitForPeer', {
    payload: { peerId: DurablePeerId },
    success: PeerDescriptor,
    error: TooManyPeerWaits,
    stream: true,
  }),
  Rpc.make('ReceiveNegotiations', {
    success: IncomingNegotiation,
    stream: true,
  }),
  Rpc.make('SendNegotiation', {
    payload: {
      recipient: DurablePeerId,
      envelope: NegotiationEnvelope,
    },
    success: Schema.Void,
    error: NegotiationTooLarge,
  }),
) {}
