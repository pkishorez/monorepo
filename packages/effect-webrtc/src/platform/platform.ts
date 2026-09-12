import { Context, Data, Effect, Stream } from 'effect';
import type { Scope } from 'effect/Scope';
import type { NegotiationMessage } from '../negotiation/index.js';

export type IceCandidate = Extract<
  NegotiationMessage,
  { readonly _tag: 'IceCandidate' }
>;

export type RtcConnectionState =
  | 'new'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'failed'
  | 'closed';

export interface RtcConfiguration {
  readonly iceServers?: ReadonlyArray<{
    readonly urls: string | ReadonlyArray<string>;
    readonly username?: string;
    readonly credential?: string;
  }>;
}

/** Host-reported ICE progress that a Connection Attempt Flow records. */
export type RtcDiagnostic =
  | { readonly _tag: 'IceConnectionState'; readonly state: string }
  | { readonly _tag: 'IceGatheringState'; readonly state: string }
  | {
      readonly _tag: 'IceCandidateError';
      readonly url: string;
      readonly errorCode: number;
      readonly errorText: string;
      readonly address: string | null;
      readonly port: number | null;
    };

/** A JSON-friendly description of an RTC Connection's transport. */
export type RtcConnectionReport = Readonly<Record<string, unknown>>;

export class RtcError extends Data.TaggedError('RtcError')<{
  readonly operation:
    | 'create-connection'
    | 'create-offer'
    | 'accept-offer'
    | 'accept-answer'
    | 'add-ice-candidate'
    | 'open-data-channel'
    | 'receive'
    | 'send'
    | 'close';
  readonly cause: unknown;
}> {}

/** The ordered binary WebRTC data channel used by the RPC Transport. */
export interface RtcDataChannel {
  readonly send: (payload: Uint8Array) => Effect.Effect<void, RtcError>;
  readonly incoming: Stream.Stream<Uint8Array, RtcError>;
  readonly close: Effect.Effect<void, RtcError>;
}

/** The narrow WebRTC connection surface required by the Peer orchestrator. */
export interface RtcConnection {
  readonly state: Stream.Stream<RtcConnectionState>;
  readonly localIceCandidates: Stream.Stream<IceCandidate, RtcError>;
  readonly incomingDataChannels: Stream.Stream<RtcDataChannel, RtcError>;
  /** Creates and installs a local offer, returning SDP with gathered ICE candidates. */
  readonly createOffer: (options?: {
    readonly iceRestart?: boolean;
  }) => Effect.Effect<string, RtcError>;
  /** Installs a remote offer and returns answering SDP with gathered ICE candidates. */
  readonly acceptOffer: (offer: string) => Effect.Effect<string, RtcError>;
  /** Installs the remote answer to a locally-created offer. */
  readonly acceptAnswer: (answer: string) => Effect.Effect<void, RtcError>;
  readonly addIceCandidate: (
    candidate: IceCandidate,
  ) => Effect.Effect<void, RtcError>;
  /** Signals that the remote Peer has no more ICE candidates. */
  readonly completeIceCandidates: Effect.Effect<void, RtcError>;
  readonly openDataChannel: Effect.Effect<RtcDataChannel, RtcError>;
  readonly close: Effect.Effect<void, RtcError>;
  /** ICE progress for diagnostics. Platforms without it may omit it. */
  readonly diagnostics?: Stream.Stream<RtcDiagnostic>;
  /** Describes the transport, including ICE candidate pairs, on demand. */
  readonly report?: Effect.Effect<RtcConnectionReport>;
}

interface WebRtcPlatformService {
  readonly makeConnection: (
    configuration?: RtcConfiguration,
  ) => Effect.Effect<RtcConnection, RtcError, Scope>;
}

/** Host-specific WebRTC primitives supplied by browser, Node, or tests. */
export class WebRtcPlatform extends Context.Service<
  WebRtcPlatform,
  WebRtcPlatformService
>()('effect-webrtc/WebRtcPlatform') {}
