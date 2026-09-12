import { Cause, Effect, Layer, Queue, Stream } from 'effect';
import {
  type IceCandidate,
  type RtcConfiguration,
  type RtcConnection,
  type RtcConnectionState,
  type RtcDataChannel,
  RtcError,
  WebRtcPlatform,
} from './platform.js';

const dataChannelLabel = 'effect-webrtc';

const rtcError = (operation: RtcError['operation'], cause: unknown) =>
  new RtcError({ operation, cause });

const tryPromise = <A>(
  operation: RtcError['operation'],
  run: () => PromiseLike<A>,
) =>
  Effect.tryPromise({
    try: run,
    catch: (cause) => rtcError(operation, cause),
  });

const nativeConfiguration = (
  configuration: RtcConfiguration | undefined,
): RTCConfiguration | undefined =>
  configuration?.iceServers === undefined
    ? undefined
    : {
        iceServers: configuration.iceServers.map((server) => ({
          ...server,
          urls:
            typeof server.urls === 'string' ? server.urls : [...server.urls],
        })),
      };

interface BrowserDataChannel extends RtcDataChannel {
  readonly shutdown: () => void;
}

const makeDataChannel = (
  native: RTCDataChannel,
  encodePayload: (payload: Uint8Array) => ArrayBufferView<ArrayBuffer>,
): BrowserDataChannel => {
  const incoming = Effect.runSync(
    Queue.unbounded<Uint8Array, RtcError | Cause.Done>(),
  );
  let stopped = false;

  native.binaryType = 'arraybuffer';

  const stop = () => {
    if (stopped) return;
    stopped = true;
    Queue.endUnsafe(incoming);
  };

  const fail = (cause: unknown) => {
    if (stopped) return;
    stopped = true;
    Queue.failCauseUnsafe(incoming, Cause.fail(rtcError('receive', cause)));
  };

  native.addEventListener('message', (event) => {
    const value = event.data as unknown;
    const bytes =
      value instanceof ArrayBuffer
        ? new Uint8Array(value)
        : ArrayBuffer.isView(value)
          ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
          : undefined;
    if (bytes === undefined) {
      fail(new TypeError('RTC Data Channel received non-binary data'));
    } else {
      Queue.offerUnsafe(incoming, bytes.slice());
    }
  });
  native.addEventListener('error', fail);
  native.addEventListener('close', stop);

  const awaitOpen = Effect.callback<void, RtcError>((resume) => {
    if (native.readyState === 'open') {
      resume(Effect.void);
      return;
    }
    if (native.readyState !== 'connecting') {
      resume(
        Effect.fail(
          rtcError('send', `RTC Data Channel is ${native.readyState}`),
        ),
      );
      return;
    }

    const cleanup = () => {
      native.removeEventListener('open', onOpen);
      native.removeEventListener('error', onFailure);
      native.removeEventListener('close', onFailure);
    };
    const onOpen = () => {
      cleanup();
      resume(Effect.void);
    };
    const onFailure = (event: Event) => {
      cleanup();
      resume(Effect.fail(rtcError('send', event)));
    };
    native.addEventListener('open', onOpen);
    native.addEventListener('error', onFailure);
    native.addEventListener('close', onFailure);
    return Effect.sync(cleanup);
  });

  const shutdown = () => {
    stop();
    native.close();
  };

  return {
    send: (payload) =>
      awaitOpen.pipe(
        Effect.flatMap(() =>
          Effect.try({
            try: () => native.send(encodePayload(payload)),
            catch: (cause) => rtcError('send', cause),
          }),
        ),
      ),
    incoming: Stream.fromQueue(incoming),
    close: Effect.try({
      try: shutdown,
      catch: (cause) => rtcError('close', cause),
    }),
    shutdown,
  };
};

type PeerConnectionConstructor = new (
  configuration?: RTCConfiguration,
) => RTCPeerConnection;

export const makeLayer = (
  getPeerConnection: () => PeerConnectionConstructor,
  encodePayload: (payload: Uint8Array) => ArrayBufferView<ArrayBuffer> = (
    payload,
  ) => payload.slice(),
): Layer.Layer<WebRtcPlatform> => {
  const makeConnection = Effect.fn('WebRtcPlatform.makeConnection')(function* (
    configuration?: RtcConfiguration,
  ) {
    const native = yield* Effect.try({
      try: () => {
        const PeerConnection = getPeerConnection();
        return new PeerConnection(nativeConfiguration(configuration));
      },
      catch: (cause) => rtcError('create-connection', cause),
    });

    const states = yield* Queue.unbounded<RtcConnectionState, Cause.Done>();
    const localCandidates = yield* Queue.unbounded<
      IceCandidate,
      RtcError | Cause.Done
    >();
    const incomingChannels = yield* Queue.unbounded<
      RtcDataChannel,
      RtcError | Cause.Done
    >();
    const channels = new Set<BrowserDataChannel>();
    const pendingCandidates: Array<RTCIceCandidateInit | null> = [];
    let lastState: RtcConnectionState | undefined;
    let closed = false;

    const emitState = () => {
      const state = native.connectionState;
      if (state !== lastState) {
        lastState = state;
        Queue.offerUnsafe(states, state);
      }
    };

    const onIceCandidate = (event: RTCPeerConnectionIceEvent) => {
      if (event.candidate == null) {
        Queue.endUnsafe(localCandidates);
        return;
      }
      Queue.offerUnsafe(localCandidates, {
        _tag: 'IceCandidate',
        candidate: event.candidate.candidate,
        sdpMid: event.candidate.sdpMid ?? null,
        sdpMLineIndex: event.candidate.sdpMLineIndex ?? null,
        usernameFragment: event.candidate.usernameFragment ?? null,
      });
    };

    const onDataChannel = (event: RTCDataChannelEvent) => {
      if (event.channel.label !== dataChannelLabel) {
        event.channel.close();
        return;
      }
      const channel = makeDataChannel(event.channel, encodePayload);
      channels.add(channel);
      Queue.offerUnsafe(incomingChannels, channel);
    };

    native.addEventListener('connectionstatechange', emitState);
    native.addEventListener('icecandidate', onIceCandidate);
    native.addEventListener('datachannel', onDataChannel);
    emitState();

    const addNativeIceCandidate = (candidate: RTCIceCandidateInit | null) =>
      tryPromise('add-ice-candidate', () => native.addIceCandidate(candidate));

    const flushCandidates = Effect.suspend(() =>
      Effect.forEach(pendingCandidates.splice(0), addNativeIceCandidate, {
        discard: true,
      }),
    );

    const addIceCandidate = (candidate: IceCandidate) =>
      Effect.suspend(() => {
        const init: RTCIceCandidateInit = {
          candidate: candidate.candidate,
          sdpMid: candidate.sdpMid,
          sdpMLineIndex: candidate.sdpMLineIndex,
          usernameFragment: candidate.usernameFragment,
        };
        if (native.remoteDescription === null) {
          pendingCandidates.push(init);
          return Effect.void;
        }
        return addNativeIceCandidate(init);
      });

    const completeIceCandidates = Effect.suspend(() =>
      native.remoteDescription === null
        ? Effect.sync(() => {
            pendingCandidates.push(null);
          })
        : addNativeIceCandidate(null),
    );

    const close = tryPromise('close', async () => {
      if (closed) return;
      closed = true;
      for (const channel of channels) channel.shutdown();
      await native.close();
      emitState();
      Queue.endUnsafe(states);
      Queue.endUnsafe(localCandidates);
      Queue.endUnsafe(incomingChannels);
      native.removeEventListener('connectionstatechange', emitState);
      native.removeEventListener('icecandidate', onIceCandidate);
      native.removeEventListener('datachannel', onDataChannel);
    });

    const connection: RtcConnection = {
      state: Stream.fromQueue(states),
      localIceCandidates: Stream.fromQueue(localCandidates),
      incomingDataChannels: Stream.fromQueue(incomingChannels),
      createOffer: (options) =>
        tryPromise('create-offer', async () => {
          const offer = await native.createOffer(options);
          await native.setLocalDescription(offer);
          if (offer.sdp === undefined) throw new Error('Offer has no SDP');
          return offer.sdp;
        }),
      acceptOffer: (offer) =>
        Effect.gen(function* () {
          const answer = yield* tryPromise('accept-offer', async () => {
            await native.setRemoteDescription({ type: 'offer', sdp: offer });
            const description = await native.createAnswer();
            await native.setLocalDescription(description);
            if (description.sdp === undefined) {
              throw new Error('Answer has no SDP');
            }
            return description.sdp;
          });
          yield* flushCandidates;
          return answer;
        }),
      acceptAnswer: (answer) =>
        Effect.gen(function* () {
          yield* tryPromise('accept-answer', () =>
            native.setRemoteDescription({ type: 'answer', sdp: answer }),
          );
          yield* flushCandidates;
        }),
      addIceCandidate,
      completeIceCandidates,
      openDataChannel: Effect.try({
        try: () => {
          const channel = makeDataChannel(
            native.createDataChannel(dataChannelLabel, { ordered: true }),
            encodePayload,
          );
          channels.add(channel);
          return channel;
        },
        catch: (cause) => rtcError('open-data-channel', cause),
      }),
      close,
    };

    yield* Effect.addFinalizer(() => Effect.orDie(close));
    return connection;
  });

  return Layer.succeed(WebRtcPlatform, WebRtcPlatform.of({ makeConnection }));
};
