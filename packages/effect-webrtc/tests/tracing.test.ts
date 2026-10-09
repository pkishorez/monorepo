import { Effect, Exit, Option } from 'effect';
import { describe, expect, it } from 'vitest';
import {
  AttemptOutcome,
  continueConnectionAttempt,
  startConnectionAttempt,
} from '../src/tracing/index.js';
import { NegotiationMessage } from '../src/negotiation/index.js';
import { PeerId } from '../src/peer-identity/index.js';
import { recordSpans } from './record-spans.js';

const alice = PeerId.make('alice');
const bob = PeerId.make('bob');

describe('Connection Attempt span', () => {
  it('records ICE candidate details, diagnostics, and the failure report', async () => {
    const { spans, tracer } = recordSpans();

    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const attempt = yield* startConnectionAttempt({
            localPeerId: alice,
            remotePeerId: bob,
          });
          yield* attempt.send(
            NegotiationMessage.make({
              _tag: 'IceCandidate',
              candidate:
                'candidate:1 1 udp 2122260223 4d3a.local 56245 typ host generation 0',
              sdpMid: '0',
              sdpMLineIndex: 0,
              usernameFragment: null,
            }),
          );
          yield* attempt.note('ICE connection failed', {
            level: 'error',
            attributes: { iceConnectionState: 'failed' },
          });
          yield* attempt.end(AttemptOutcome.failed('RTC connection failed'), {
            candidatePairs: [{ state: 'failed' }],
          });
        }),
      ).pipe(Effect.withTracer(tracer)),
    );

    const span = spans.find(({ name }) => name === 'WebRtc.connectionAttempt')!;
    expect(Option.isNone(span.parent)).toBe(true);
    expect(Object.fromEntries(span.attributes)).toMatchObject({
      'webrtc.peer.local_id': 'alice',
      'webrtc.peer.remote_id': 'bob',
      'webrtc.peer_session.id': expect.any(String),
      'webrtc.connection_attempt.id': expect.any(String),
      'webrtc.negotiation.role': 'offerer',
      'webrtc.connection_attempt.outcome': 'failed',
      'webrtc.connection_attempt.outcome_reason': 'RTC connection failed',
      candidatePairs: [{ state: 'failed' }],
    });
    const [candidate, note] = span.events;
    expect(candidate?.[0]).toBe('IceCandidate sent');
    expect(candidate?.[2]).toMatchObject({
      'webrtc.negotiation.message': 'IceCandidate',
      candidateType: 'host',
      protocol: 'udp',
      address: '4d3a.local',
      port: '56245',
    });
    expect(note?.[0]).toBe('ICE connection failed');
    expect(note?.[2]).toMatchObject({
      level: 'error',
      iceConnectionState: 'failed',
    });
    expect(
      span.status._tag === 'Ended' && Exit.isFailure(span.status.exit),
    ).toBe(true);
  });

  it('continues the offerer trace on the answerer and ends once on scope close', async () => {
    const { spans, tracer } = recordSpans();

    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const offerer = yield* startConnectionAttempt({
            localPeerId: alice,
            remotePeerId: bob,
          });
          const offer = yield* offerer.send(
            NegotiationMessage.make({ _tag: 'Offer', description: 'offer' }),
          );
          const answerer = yield* continueConnectionAttempt({
            localPeerId: bob,
            remotePeerId: alice,
            incoming: offer,
          });
          expect(answerer.connectionAttemptId).toBe(
            offerer.connectionAttemptId,
          );
          yield* offerer.end(AttemptOutcome.completed());
          yield* offerer.end(AttemptOutcome.failed('ignored'));
        }),
      ).pipe(Effect.withTracer(tracer)),
    );

    const [offerSpan, answerSpan] = spans.filter(
      ({ name }) => name === 'WebRtc.connectionAttempt',
    );
    expect(answerSpan?.traceId).toBe(offerSpan?.traceId);
    expect(Option.getOrUndefined(answerSpan!.parent)?.spanId).toBe(
      offerSpan?.spanId,
    );
    expect(answerSpan?.attributes.get('webrtc.negotiation.role')).toBe(
      'answerer',
    );
    expect(offerSpan?.attributes.get('webrtc.connection_attempt.outcome')).toBe(
      'completed',
    );
    expect(
      answerSpan?.attributes.get('webrtc.connection_attempt.outcome'),
    ).toBe('interrupted');
  });
});
