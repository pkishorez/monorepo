import { Effect, Logger, References } from 'effect';
import { describe, expect, it } from 'vitest';
import { Activation } from '@pkishorez/effect-tracer/flow';
import { startConnectionAttempt } from '../src/flow-tracing/index.js';
import { NegotiationMessage } from '../src/negotiation/index.js';
import { PeerId } from '../src/peer-identity/index.js';

describe('Connection Attempt Flow', () => {
  it('records ICE candidate details, diagnostics, and the failure report', async () => {
    const annotations: Readonly<Record<string, unknown>>[] = [];
    const logger = Logger.make<unknown, void>((options) => {
      annotations.push(options.fiber.getRef(References.CurrentLogAnnotations));
    });

    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const attempt = yield* startConnectionAttempt({
            localPeerId: PeerId.make('alice'),
            remotePeerId: PeerId.make('bob'),
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
          yield* attempt.end(Activation.failed('RTC connection failed'), {
            candidatePairs: [{ state: 'failed' }],
          });
        }),
      ).pipe(Effect.withLogger(logger)),
    );

    const [, candidate, note, end] = annotations;
    expect(candidate).toMatchObject({
      'flow.item.type': 'message',
      'flowattr.candidateType': 'host',
      'flowattr.protocol': 'udp',
      'flowattr.address': '4d3a.local',
      'flowattr.port': '56245',
    });
    expect(note).toMatchObject({
      'flow.item.type': 'local-event',
      'flowattr.iceConnectionState': 'failed',
    });
    expect(end).toMatchObject({
      'flow.activation.outcome': 'failed',
      'flowattr.error': 'RTC connection failed',
      'flowattr.candidatePairs': [{ state: 'failed' }],
    });
  });
});
