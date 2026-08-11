import { Effect, Logger, References } from 'effect';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { makeTraceRecorder } from '../recorder/recorder.js';
import { initFlow } from './flow.js';

describe('initFlow', () => {
  it('adds Flow metadata to local events, messages, and Flow end', async () => {
    const annotations: Readonly<Record<string, unknown>>[] = [];
    const logger = Logger.make<unknown, void>((options) => {
      annotations.push(options.fiber.getRef(References.CurrentLogAnnotations));
    });
    const flow = initFlow({
      id: 'call-123',
      participantName: 'client-a',
      participants: ['server', 'client-b'] as const,
    });

    await Effect.runPromise(
      Effect.gen(function* () {
        yield* flow.log('created');
        yield* flow.send('server', { offer: 'sdp' });
        yield* flow.end('completed');
      }).pipe(Effect.withLogger(logger)),
    );

    expect(annotations).toEqual([
      {
        'flow.id': 'call-123',
        'flow.item.type': 'local-event',
        'flow.participant.name': 'client-a',
      },
      {
        'flow.id': 'call-123',
        'flow.item.type': 'message',
        'flow.message.to': 'server',
        'flow.participant.name': 'client-a',
      },
      {
        'flow.id': 'call-123',
        'flow.item.type': 'local-event',
        'flow.participant.name': 'client-a',
        'flow.status': 'completed',
      },
    ]);
  });

  it('restricts message destinations when participants are provided', () => {
    const flow = initFlow({
      id: 'call-123',
      participantName: 'client-a',
      participants: ['server', 'client-b'] as const,
    });

    expectTypeOf(flow.send).parameter(0).toEqualTypeOf<'server' | 'client-b'>();
  });

  it('marks only Flow activities with Flow span attributes', async () => {
    const recorder = makeTraceRecorder();
    const flow = initFlow({ id: 'call-123', participantName: 'client-a' });

    await Effect.runPromise(
      recorder.instrument(
        Effect.gen(function* () {
          yield* Effect.void.pipe(Effect.withSpan('ordinary-child'));
        }).pipe(flow.withSpan('Create offer')),
      ),
    );

    const spans = recorder.snapshot().spans;
    expect(
      spans.find(({ name }) => name === 'Create offer')?.attributes,
    ).toEqual({
      'flow.id': 'call-123',
      'flow.participant.name': 'client-a',
    });
    expect(
      spans.find(({ name }) => name === 'ordinary-child')?.attributes,
    ).toEqual({});
  });
});
