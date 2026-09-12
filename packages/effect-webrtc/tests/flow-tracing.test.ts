import { Activation } from '@pkishorez/effect-tracer/flow';
import { makeTraceRecorder } from '@pkishorez/effect-tracer/recorder';
import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import {
  continueConnectionAttempt,
  continueRpcInvocation,
  startConnectionAttempt,
  startRpcInvocation,
} from '../src/flow-tracing/index.js';
import { NegotiationMessage } from '../src/negotiation/index.js';
import { PeerId } from '../src/peer-identity/index.js';

const alice = PeerId.make('alice');
const bob = PeerId.make('bob');

describe('WebRTC Flow tracing', () => {
  it('continues the offerer Flow on the answering Peer', async () => {
    const recorder = makeTraceRecorder();
    const attemptId = await Effect.runPromise(
      recorder.instrument(
        Effect.gen(function* () {
          const outgoing = yield* startConnectionAttempt({
            localPeerId: alice,
            remotePeerId: bob,
          });
          const offer = yield* outgoing.send(
            NegotiationMessage.make({
              _tag: 'Offer',
              description: 'not-recorded',
            }),
          );
          const incoming = yield* continueConnectionAttempt({
            localPeerId: bob,
            remotePeerId: alice,
            incoming: offer,
          });
          const answer = yield* incoming.reply(
            offer,
            NegotiationMessage.make({
              _tag: 'Answer',
              description: 'also-not-recorded',
            }),
          );
          outgoing.observe(answer);
          yield* outgoing.connected;
          yield* incoming.connected;
          yield* outgoing.end(Activation.completed());
          yield* incoming.end(Activation.completed());
          return outgoing.connectionAttemptId;
        }).pipe(Effect.scoped),
      ),
    );

    const flow = recorder.snapshotFlow(attemptId)!;
    expect(
      new Set(flow.items.map(({ participantName }) => participantName)),
    ).toEqual(new Set(['peer:alice', 'peer:bob']));
    const messages = flow.items.filter((item) => item.kind === 'message');
    expect(messages).toHaveLength(2);
    expect(messages[1]).toEqual(
      expect.objectContaining({ replyTo: messages[0]?.messageId }),
    );
    expect(JSON.stringify(flow)).not.toContain('not-recorded');
    expect(flow.warnings).toEqual([]);
  });

  it('creates a related Flow for each RPC invocation', async () => {
    const recorder = makeTraceRecorder();
    const flowId = await Effect.runPromise(
      recorder.instrument(
        Effect.gen(function* () {
          const connection = yield* startConnectionAttempt({
            localPeerId: alice,
            remotePeerId: bob,
          });
          const outgoing = yield* startRpcInvocation({
            localPeerId: alice,
            remotePeerId: bob,
            peerSessionId: connection.peerSessionId,
            connectionAttemptId: connection.connectionAttemptId,
            rpcTag: 'Users.Get',
          });
          const incoming = yield* continueRpcInvocation({
            localPeerId: bob,
            remotePeerId: alice,
            rpcTag: 'Users.Get',
            headers: outgoing.headers,
          });
          yield* incoming.reply(Activation.completed());
          yield* outgoing.end(Activation.completed());
          yield* connection.end(Activation.completed());
          return outgoing.flow.id;
        }).pipe(Effect.scoped),
      ),
    );

    const flow = recorder.snapshotFlow(flowId)!;
    expect(flow.activations).toHaveLength(2);
    expect(flow.items.filter((item) => item.kind === 'message')).toHaveLength(
      2,
    );
    expect(flow.warnings).toEqual([]);
  });
});
