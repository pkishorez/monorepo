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
  remoteDescription: RTCSessionDescription | null = null;
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
});
