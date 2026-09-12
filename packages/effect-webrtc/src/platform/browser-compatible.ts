import { Cause, Effect, Layer, Queue, Stream } from 'effect';
import {
  type IceCandidate,
  type RtcConfiguration,
  type RtcConnection,
  type RtcConnectionReport,
  type RtcConnectionState,
  type RtcDataChannel,
  type RtcDiagnostic,
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

/** The candidate stats fields read here; lib.dom does not declare them. */
interface IceCandidateStats extends RTCStats {
  readonly candidateType?: string;
  readonly protocol?: string;
  readonly address?: string | null;
  readonly port?: number;
}

const describeCandidate = (candidate: IceCandidateStats | undefined) =>
  candidate === undefined
    ? null
    : `${candidate.candidateType ?? '?'} ${candidate.protocol ?? '?'} ${candidate.address ?? '?'}:${candidate.port ?? '?'}`;

const summarizeStats = (stats: RTCStatsReport) => {
  const candidates = new Map<string, IceCandidateStats>();
  const pairs: RTCIceCandidatePairStats[] = [];
  const transports: Array<Record<string, unknown>> = [];
  stats.forEach((entry: RTCStats) => {
    switch (entry.type) {
      case 'local-candidate':
      case 'remote-candidate':
        candidates.set(entry.id, entry as IceCandidateStats);
        break;
      case 'candidate-pair':
        pairs.push(entry as RTCIceCandidatePairStats);
        break;
      case 'transport': {
        const transport = entry as RTCTransportStats;
        transports.push({
          dtlsState: transport.dtlsState,
          iceState: transport.iceState ?? null,
          selectedCandidatePairId: transport.selectedCandidatePairId ?? null,
        });
        break;
      }
    }
  });
  const byType = (type: RTCStatsType) =>
    [...candidates.values()]
      .filter((candidate) => candidate.type === type)
      .map(describeCandidate);
  return {
    localCandidates: byType('local-candidate'),
    remoteCandidates: byType('remote-candidate'),
    candidatePairs: pairs.map((pair) => ({
      id: pair.id,
      state: pair.state,
      nominated: pair.nominated ?? false,
      local: describeCandidate(candidates.get(pair.localCandidateId)),
      remote: describeCandidate(candidates.get(pair.remoteCandidateId)),
      requestsSent: pair.requestsSent ?? null,
      responsesReceived: pair.responsesReceived ?? null,
    })),
    transports,
  };
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
    const diagnostics = yield* Queue.unbounded<RtcDiagnostic, Cause.Done>();
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

    const onIceConnectionState = () => {
      const state: unknown = native.iceConnectionState;
      if (typeof state !== 'string') return;
      Queue.offerUnsafe(diagnostics, { _tag: 'IceConnectionState', state });
    };
    const onIceGatheringState = () => {
      const state: unknown = native.iceGatheringState;
      if (typeof state !== 'string') return;
      Queue.offerUnsafe(diagnostics, { _tag: 'IceGatheringState', state });
    };
    const onIceCandidateError = (event: Event) => {
      const error = event as Partial<RTCPeerConnectionIceErrorEvent>;
      Queue.offerUnsafe(diagnostics, {
        _tag: 'IceCandidateError',
        url: error.url ?? '',
        errorCode: error.errorCode ?? 0,
        errorText: error.errorText ?? '',
        address: error.address ?? null,
        port: error.port ?? null,
      });
    };

    native.addEventListener('connectionstatechange', emitState);
    native.addEventListener('icecandidate', onIceCandidate);
    native.addEventListener('datachannel', onDataChannel);
    native.addEventListener('iceconnectionstatechange', onIceConnectionState);
    native.addEventListener('icegatheringstatechange', onIceGatheringState);
    native.addEventListener('icecandidateerror', onIceCandidateError);
    emitState();

    const report: Effect.Effect<RtcConnectionReport> = Effect.promise(
      async () => {
        const base = {
          connectionState: native.connectionState,
          iceConnectionState: native.iceConnectionState ?? null,
          iceGatheringState: native.iceGatheringState ?? null,
          signalingState: native.signalingState ?? null,
        };
        if (typeof native.getStats !== 'function') return base;
        try {
          return { ...base, ...summarizeStats(await native.getStats()) };
        } catch (cause) {
          return { ...base, statsError: String(cause) };
        }
      },
    );

    const addNativeIceCandidate = (candidate: RTCIceCandidateInit | null) =>
      tryPromise('add-ice-candidate', () => native.addIceCandidate(candidate));

    const awaitIceGathering = Effect.callback<void, RtcError>((resume) => {
      if (native.iceGatheringState === 'complete') {
        resume(Effect.void);
        return;
      }
      const onComplete = () => {
        if (native.iceGatheringState !== 'complete') return;
        native.removeEventListener('icegatheringstatechange', onComplete);
        resume(Effect.void);
      };
      native.addEventListener('icegatheringstatechange', onComplete);
      return Effect.sync(() =>
        native.removeEventListener('icegatheringstatechange', onComplete),
      );
    });

    const localDescription = (operation: RtcError['operation']) =>
      Effect.try({
        try: () => {
          const sdp = native.localDescription?.sdp;
          if (sdp === undefined)
            throw new Error('Local description has no SDP');
          return sdp;
        },
        catch: (cause) => rtcError(operation, cause),
      });

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
      Queue.endUnsafe(diagnostics);
      native.removeEventListener('connectionstatechange', emitState);
      native.removeEventListener('icecandidate', onIceCandidate);
      native.removeEventListener('datachannel', onDataChannel);
      native.removeEventListener(
        'iceconnectionstatechange',
        onIceConnectionState,
      );
      native.removeEventListener(
        'icegatheringstatechange',
        onIceGatheringState,
      );
      native.removeEventListener('icecandidateerror', onIceCandidateError);
    });

    const connection: RtcConnection = {
      state: Stream.fromQueue(states),
      localIceCandidates: Stream.fromQueue(localCandidates),
      incomingDataChannels: Stream.fromQueue(incomingChannels),
      createOffer: (options) =>
        Effect.gen(function* () {
          yield* tryPromise('create-offer', async () => {
            const offer = await native.createOffer(options);
            await native.setLocalDescription(offer);
          });
          yield* awaitIceGathering;
          return yield* localDescription('create-offer');
        }),
      acceptOffer: (offer) =>
        Effect.gen(function* () {
          yield* tryPromise('accept-offer', async () => {
            await native.setRemoteDescription({ type: 'offer', sdp: offer });
            const description = await native.createAnswer();
            await native.setLocalDescription(description);
          });
          yield* awaitIceGathering;
          yield* flushCandidates;
          return yield* localDescription('accept-offer');
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
      diagnostics: Stream.fromQueue(diagnostics),
      report,
    };

    yield* Effect.addFinalizer(() => Effect.orDie(close));
    return connection;
  });

  return Layer.succeed(WebRtcPlatform, WebRtcPlatform.of({ makeConnection }));
};
