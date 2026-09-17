import { Activation, FlowTelemetry, projectJournal } from '@pkishorez/flow';
import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import { startConnectionAttempt } from '../src/flow-tracing/index.js';
import { NegotiationMessage } from '../src/negotiation/index.js';
import { PeerId } from '../src/peer-identity/index.js';

describe('Connection Attempt Flow', () => {
  it('records ICE candidate details, diagnostics, and the failure report', async () => {
    const sink = FlowTelemetry.makeMemory();

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
      ).pipe(Effect.provideService(FlowTelemetry, sink)),
    );

    const flow = projectJournal(sink.journals()[0]!);
    const [, candidate, note, end] = flow.items;
    expect(candidate).toMatchObject({
      kind: 'message',
      attributes: {
        candidateType: 'host',
        protocol: 'udp',
        address: '4d3a.local',
        port: '56245',
      },
    });
    expect(note).toMatchObject({
      kind: 'event',
      attributes: { iceConnectionState: 'failed' },
    });
    expect(end).toMatchObject({
      kind: 'activation-end',
      outcome: 'failed',
      attributes: {
        error: 'RTC connection failed',
        candidatePairs: [{ state: 'failed' }],
      },
    });
  });
});
