import {
  Deferred,
  Effect,
  Exit,
  Fiber,
  Option,
  Queue,
  Schema,
  Stream,
} from 'effect';
import { Rpc, RpcGroup } from 'effect/rpc';
import { describe, expect, it } from 'vitest';
import {
  ConnectionAttemptId,
  PeerSessionId,
} from '../src/negotiation/index.js';
import { PeerId } from '../src/peer-identity/index.js';
import type { RtcDataChannel } from '../src/platform/platform.js';
import { make } from '../src/rpc/index.js';
import { recordSpans } from './record-spans.js';

const makeChannelPair = Effect.gen(function* () {
  const leftInbox = yield* Queue.unbounded<Uint8Array>();
  const rightInbox = yield* Queue.unbounded<Uint8Array>();
  const channel = (
    inbox: Queue.Queue<Uint8Array>,
    remote: Queue.Queue<Uint8Array>,
  ): RtcDataChannel => ({
    send: (payload) => Queue.offer(remote, payload.slice()).pipe(Effect.asVoid),
    incoming: Stream.fromQueue(inbox),
    close: Queue.shutdown(inbox),
  });
  return [
    channel(leftInbox, rightInbox),
    channel(rightInbox, leftInbox),
  ] as const;
});

describe('WebRTC RPC Transport', () => {
  it('round-trips RPC and labels redacted client and server spans with both Peers', async () => {
    const Echo = Rpc.make('Echo', {
      payload: { value: Schema.String },
      success: Schema.String,
    });
    const Api = RpcGroup.make(Echo);
    const handlers = Api.toLayer({
      Echo: ({ value }) => Effect.succeed(`response:${value}`),
    });
    const { spans, tracer } = recordSpans();
    const result = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const [aliceChannel, bobChannel] = yield* makeChannelPair;
          const peerSessionId = PeerSessionId.make('session-1');
          const connectionAttemptId = ConnectionAttemptId.make('connection-1');
          const aliceTransport = yield* make(
            {
              localPeerId: PeerId.make('alice'),
              remotePeerId: PeerId.make('bob'),
              peerSessionId,
              connectionAttemptId,
            },
            aliceChannel,
          );
          const bobTransport = yield* make(
            {
              localPeerId: PeerId.make('bob'),
              remotePeerId: PeerId.make('alice'),
              peerSessionId,
              connectionAttemptId,
            },
            bobChannel,
          );
          yield* bobTransport.serve(Api, handlers);
          const { client } = yield* aliceTransport.consume(Api);
          return yield* Effect.all(
            [
              client.Echo({ value: 'private-request' }),
              client.Echo({ value: 'second-private-request' }),
            ],
            { concurrency: 'unbounded' },
          );
        }),
      ).pipe(Effect.withTracer(tracer)),
    );

    expect(result).toEqual([
      'response:private-request',
      'response:second-private-request',
    ]);
    const clientSpans = spans.filter(
      ({ name }) => name === 'WebRtc.RpcClient.Echo',
    );
    const serverSpans = spans.filter(
      ({ name }) => name === 'WebRtc.RpcServer.Echo',
    );
    expect(clientSpans).toHaveLength(2);
    expect(serverSpans).toHaveLength(2);
    for (const span of clientSpans) {
      expect(Object.fromEntries(span.attributes)).toMatchObject({
        'webrtc.peer.local_id': 'alice',
        'webrtc.peer.remote_id': 'bob',
        'webrtc.peer_session.id': 'session-1',
        'webrtc.connection_attempt.id': 'connection-1',
      });
      expect(serverSpans.some(({ traceId }) => traceId === span.traceId)).toBe(
        true,
      );
    }
    for (const span of serverSpans) {
      expect(span.attributes.get('webrtc.peer.local_id')).toBe('bob');
    }
    const recorded = JSON.stringify(
      [...clientSpans, ...serverSpans].map((span) => [
        Object.fromEntries(span.attributes),
        span.events,
      ]),
    );
    expect(recorded).not.toContain('private-request');
  });

  it('ends both RPC spans as interrupted when the caller cancels', async () => {
    const Watch = Rpc.make('Watch', {
      success: Schema.Number,
      stream: true,
    });
    const Api = RpcGroup.make(Watch);
    const started = await Effect.runPromise(Deferred.make<void>());
    const handlers = Api.toLayer({
      Watch: () =>
        Stream.unwrap(
          Deferred.succeed(started, undefined).pipe(Effect.as(Stream.never)),
        ),
    });
    const { spans, tracer } = recordSpans();

    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const [aliceChannel, bobChannel] = yield* makeChannelPair;
          const context = {
            peerSessionId: PeerSessionId.make('session-1'),
            connectionAttemptId: ConnectionAttemptId.make('connection-1'),
          };
          const aliceTransport = yield* make(
            {
              ...context,
              localPeerId: PeerId.make('alice'),
              remotePeerId: PeerId.make('bob'),
            },
            aliceChannel,
          );
          const bobTransport = yield* make(
            {
              ...context,
              localPeerId: PeerId.make('bob'),
              remotePeerId: PeerId.make('alice'),
            },
            bobChannel,
          );
          yield* bobTransport.serve(Api, handlers);
          const { client } = yield* aliceTransport.consume(Api);
          const fiber = yield* client
            .Watch()
            .pipe(Stream.runDrain, Effect.forkChild);
          yield* Deferred.await(started);
          yield* Fiber.interrupt(fiber);
        }),
      ).pipe(Effect.withTracer(tracer)),
    );

    const rpcSpans = spans.filter(({ name }) => name.endsWith('.Watch'));
    expect(rpcSpans.map(({ name }) => name).sort()).toEqual([
      'WebRtc.RpcClient.Watch',
      'WebRtc.RpcServer.Watch',
    ]);
    for (const span of rpcSpans) {
      expect(
        span.status._tag === 'Ended' && Exit.hasInterrupts(span.status.exit),
      ).toBe(true);
    }
  });

  it('exchanges heartbeats and acknowledges a graceful close', async () => {
    const events = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const [aliceChannel, bobChannel] = yield* makeChannelPair;
          const context = {
            peerSessionId: PeerSessionId.make('session-1'),
            connectionAttemptId: ConnectionAttemptId.make('connection-1'),
          };
          const options = {
            heartbeatInterval: '5 millis',
            heartbeatTimeout: '20 millis',
          } as const;
          const alice = yield* make(
            {
              ...context,
              localPeerId: PeerId.make('alice'),
              remotePeerId: PeerId.make('bob'),
            },
            aliceChannel,
            options,
          );
          const bob = yield* make(
            {
              ...context,
              localPeerId: PeerId.make('bob'),
              remotePeerId: PeerId.make('alice'),
            },
            bobChannel,
            options,
          );
          const heartbeat = yield* Stream.runHead(
            alice.events.pipe(
              Stream.filter(({ _tag }) => _tag === 'HeartbeatReceived'),
            ),
          ).pipe(Effect.forkChild);
          const remoteClose = yield* Stream.runHead(
            bob.events.pipe(
              Stream.filter(({ _tag }) => _tag === 'CloseReceived'),
            ),
          ).pipe(Effect.forkChild);

          const heartbeatEvent = yield* Fiber.join(heartbeat);
          yield* alice.closeRemote;
          const closeEvent = yield* Fiber.join(remoteClose);
          return [heartbeatEvent, closeEvent];
        }),
      ),
    );

    expect(events.map((event) => Option.getOrThrow(event)._tag)).toEqual([
      'HeartbeatReceived',
      'CloseReceived',
    ]);
  });
});
