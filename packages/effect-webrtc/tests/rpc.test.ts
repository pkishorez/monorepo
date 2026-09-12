import { makeTraceRecorder } from '@pkishorez/effect-tracer/recorder';
import { Deferred, Effect, Fiber, Queue, Schema, Stream } from 'effect';
import { Rpc, RpcGroup } from 'effect/unstable/rpc';
import { describe, expect, it } from 'vitest';
import {
  ConnectionAttemptId,
  PeerSessionId,
} from '../src/negotiation/index.js';
import { PeerId } from '../src/peer-identity/index.js';
import type { RtcDataChannel } from '../src/platform/platform.js';
import { make } from '../src/rpc/index.js';

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
  it('round-trips RPC and records a redacted two-Peer Flow', async () => {
    const Echo = Rpc.make('Echo', {
      payload: { value: Schema.String },
      success: Schema.String,
    });
    const Api = RpcGroup.make(Echo);
    const handlers = Api.toLayer({
      Echo: ({ value }) => Effect.succeed(`response:${value}`),
    });
    const recorder = makeTraceRecorder();
    const result = await Effect.runPromise(
      recorder.instrument(
        Effect.scoped(
          Effect.gen(function* () {
            const [aliceChannel, bobChannel] = yield* makeChannelPair;
            const peerSessionId = PeerSessionId.make('session-1');
            const connectionAttemptId =
              ConnectionAttemptId.make('connection-1');
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
        ),
      ),
    );

    expect(result).toEqual([
      'response:private-request',
      'response:second-private-request',
    ]);
    const flows = recorder.snapshotFlows();
    expect(flows).toHaveLength(2);
    for (const flow of flows) {
      expect(flow.parentFlowId).toBe('connection-1');
      expect(
        new Set(flow.items.map(({ participantName }) => participantName)),
      ).toEqual(new Set(['peer:alice', 'peer:bob']));
      expect(flow.warnings).toEqual([]);
    }
    expect(JSON.stringify(flows)).not.toContain('private-request');
    expect(JSON.stringify(flows)).not.toContain('response:private-request');
  });

  it('records RPC cancellation without tracing stream chunks', async () => {
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
    const recorder = makeTraceRecorder();

    await Effect.runPromise(
      recorder.instrument(
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
        ),
      ),
    );

    const [flow] = recorder.snapshotFlows();
    expect(flow?.items.filter(({ kind }) => kind === 'message')).toHaveLength(
      2,
    );
    expect(flow?.activations.map(({ outcome }) => outcome)).toEqual([
      'interrupted',
      'interrupted',
    ]);
  });
});
