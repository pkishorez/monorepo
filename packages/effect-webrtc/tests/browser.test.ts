import { afterEach, describe, expect, it, vi } from 'vitest';
import { Effect, Fiber, Option, Stream } from 'effect';
import { WebRtcPlatform } from '../src/platform/platform.js';
import { layer } from '../src/platform/browser/index.js';

class FakeDataChannel extends EventTarget {
  readonly label: string;
  binaryType: BinaryType = 'blob';
  readyState: RTCDataChannelState = 'connecting';
  readonly sent: Uint8Array[] = [];

  constructor(label: string) {
    super();
    this.label = label;
  }

  open() {
    this.readyState = 'open';
    this.dispatchEvent(new Event('open'));
  }

  receive(data: unknown) {
    this.dispatchEvent(Object.assign(new Event('message'), { data }));
  }

  send(data: ArrayBufferView) {
    this.sent.push(
      new Uint8Array(data.buffer, data.byteOffset, data.byteLength).slice(),
    );
  }

  close() {
    if (this.readyState === 'closed') return;
    this.readyState = 'closed';
    this.dispatchEvent(new Event('close'));
  }
}

class FakePeerConnection extends EventTarget {
  static instances: FakePeerConnection[] = [];

  connectionState: RTCPeerConnectionState = 'new';
  iceConnectionState: RTCIceConnectionState = 'new';
  iceGatheringState: RTCIceGatheringState = 'new';
  signalingState: RTCSignalingState = 'stable';
  remoteDescription: RTCSessionDescription | null = null;
  stats: RTCStats[] = [];
  readonly addedCandidates: Array<RTCIceCandidateInit | null> = [];
  readonly channels: FakeDataChannel[] = [];

  constructor(readonly configuration?: RTCConfiguration) {
    super();
    FakePeerConnection.instances.push(this);
  }

  async createOffer(options?: RTCOfferOptions) {
    return {
      type: 'offer' as const,
      sdp: String(options?.iceRestart === true),
    };
  }

  async createAnswer() {
    return { type: 'answer' as const, sdp: 'answer' };
  }

  async setLocalDescription(_description: RTCSessionDescriptionInit) {}

  async setRemoteDescription(description: RTCSessionDescriptionInit) {
    this.remoteDescription = description as RTCSessionDescription;
  }

  async addIceCandidate(candidate?: RTCIceCandidateInit | null) {
    this.addedCandidates.push(candidate ?? null);
  }

  createDataChannel(label: string) {
    const channel = new FakeDataChannel(label);
    this.channels.push(channel);
    return channel as unknown as RTCDataChannel;
  }

  emitCandidate(candidate: Partial<RTCIceCandidate>) {
    this.dispatchEvent(
      Object.assign(new Event('icecandidate'), { candidate }) as Event,
    );
  }

  emitDataChannel(channel: FakeDataChannel) {
    this.dispatchEvent(
      Object.assign(new Event('datachannel'), { channel }) as Event,
    );
  }

  async getStats() {
    return new Map(this.stats.map((entry) => [entry.id, entry]));
  }

  setIceConnectionState(state: RTCIceConnectionState) {
    this.iceConnectionState = state;
    this.dispatchEvent(new Event('iceconnectionstatechange'));
  }

  emitIceCandidateError(detail: Record<string, unknown>) {
    this.dispatchEvent(
      Object.assign(new Event('icecandidateerror'), detail) as Event,
    );
  }

  close() {
    this.connectionState = 'closed';
    this.dispatchEvent(new Event('connectionstatechange'));
  }
}

afterEach(() => {
  FakePeerConnection.instances = [];
  vi.unstubAllGlobals();
});

describe('browser platform', () => {
  it('fails RTC Connection creation outside a browser', async () => {
    vi.stubGlobal('RTCPeerConnection', undefined);

    const error = await Effect.runPromise(
      Effect.gen(function* () {
        const platform = yield* WebRtcPlatform;
        return yield* Effect.flip(platform.makeConnection());
      }).pipe(Effect.scoped, Effect.provide(layer)),
    );

    expect(error.operation).toBe('create-connection');
  });

  it('buffers native events and remote ICE until they can be consumed', async () => {
    vi.stubGlobal('RTCPeerConnection', FakePeerConnection);

    await Effect.runPromise(
      Effect.gen(function* () {
        const platform = yield* WebRtcPlatform;
        const connection = yield* platform.makeConnection({
          iceServers: [{ urls: ['stun:one'] }],
        });
        const peer = FakePeerConnection.instances[0]!;

        peer.emitCandidate({
          candidate: 'candidate',
          sdpMid: '0',
          sdpMLineIndex: 0,
          usernameFragment: 'user',
        });
        const localCandidate = Option.getOrThrow(
          yield* Stream.runHead(connection.localIceCandidates),
        );
        expect(localCandidate.candidate).toBe('candidate');

        yield* connection.addIceCandidate(localCandidate);
        yield* connection.completeIceCandidates;
        expect(peer.addedCandidates).toEqual([]);
        yield* connection.acceptAnswer('answer');
        expect(peer.addedCandidates).toEqual([
          {
            candidate: 'candidate',
            sdpMid: '0',
            sdpMLineIndex: 0,
            usernameFragment: 'user',
          },
          null,
        ]);

        const remoteNative = new FakeDataChannel('effect-webrtc');
        peer.emitDataChannel(remoteNative);
        remoteNative.receive(Uint8Array.from([1, 2, 3]));
        const remote = Option.getOrThrow(
          yield* Stream.runHead(connection.incomingDataChannels),
        );
        expect(
          Option.getOrThrow(yield* Stream.runHead(remote.incoming)),
        ).toEqual(Uint8Array.from([1, 2, 3]));

        const local = yield* connection.openDataChannel;
        const sending = yield* local
          .send(Uint8Array.from([4, 5]))
          .pipe(Effect.forkScoped({ startImmediately: true }));
        expect(peer.channels[0]!.sent).toEqual([]);
        peer.channels[0]!.open();
        yield* Fiber.join(sending);
        expect(peer.channels[0]!.sent).toEqual([Uint8Array.from([4, 5])]);
      }).pipe(Effect.scoped, Effect.provide(layer)),
    );
  });

  it('reports ICE progress and the candidate pairs behind a failure', async () => {
    vi.stubGlobal('RTCPeerConnection', FakePeerConnection);

    await Effect.runPromise(
      Effect.gen(function* () {
        const platform = yield* WebRtcPlatform;
        const connection = yield* platform.makeConnection();
        const peer = FakePeerConnection.instances[0]!;

        peer.setIceConnectionState('checking');
        peer.emitIceCandidateError({
          url: 'stun:one',
          errorCode: 701,
          errorText: 'STUN host lookup failed',
          address: null,
          port: null,
        });
        peer.setIceConnectionState('failed');
        const diagnostics = yield* Stream.runCollect(
          Stream.take(connection.diagnostics!, 3),
        );
        expect([...diagnostics]).toEqual([
          { _tag: 'IceConnectionState', state: 'checking' },
          {
            _tag: 'IceCandidateError',
            url: 'stun:one',
            errorCode: 701,
            errorText: 'STUN host lookup failed',
            address: null,
            port: null,
          },
          { _tag: 'IceConnectionState', state: 'failed' },
        ]);

        peer.stats = [
          {
            id: 'L1',
            type: 'local-candidate',
            timestamp: 0,
            candidateType: 'host',
            protocol: 'udp',
            address: 'abc.local',
            port: 5000,
          } as RTCStats,
          {
            id: 'R1',
            type: 'remote-candidate',
            timestamp: 0,
            candidateType: 'host',
            protocol: 'udp',
            address: 'def.local',
            port: 6000,
          } as RTCStats,
          {
            id: 'P1',
            type: 'candidate-pair',
            timestamp: 0,
            localCandidateId: 'L1',
            remoteCandidateId: 'R1',
            state: 'failed',
            requestsSent: 7,
            responsesReceived: 0,
          } as RTCStats,
          {
            id: 'T1',
            type: 'transport',
            timestamp: 0,
            dtlsState: 'new',
            iceState: 'failed',
          } as RTCStats,
        ];
        expect(yield* connection.report!).toEqual({
          connectionState: 'new',
          iceConnectionState: 'failed',
          iceGatheringState: 'new',
          signalingState: 'stable',
          localCandidates: ['host udp abc.local:5000'],
          remoteCandidates: ['host udp def.local:6000'],
          candidatePairs: [
            {
              id: 'P1',
              state: 'failed',
              nominated: false,
              local: 'host udp abc.local:5000',
              remote: 'host udp def.local:6000',
              requestsSent: 7,
              responsesReceived: 0,
            },
          ],
          transports: [
            {
              dtlsState: 'new',
              iceState: 'failed',
              selectedCandidatePairId: null,
            },
          ],
        });
      }).pipe(Effect.scoped, Effect.provide(layer)),
    );
  });
});
