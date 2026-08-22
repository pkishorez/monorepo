import { Effect, Logger, References, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { makeTraceRecorder } from '../recorder/recorder.js';
import {
  Activation,
  initFlow,
  projectFlow,
  RecordedFlowSchema,
} from './flow.js';

describe('initFlow', () => {
  it('adds Flow metadata to local events, messages, and Activations', async () => {
    const annotations: Readonly<Record<string, unknown>>[] = [];
    const logger = Logger.make<unknown, void>((options) => {
      annotations.push(options.fiber.getRef(References.CurrentLogAnnotations));
    });
    const flow = initFlow({ id: 'call-123', participantName: 'client-a' });

    await Effect.runPromise(
      Effect.gen(function* () {
        yield* flow.log('created', {
          attributes: { 'http.request.method': 'POST' },
          flowAttributes: { roomId: 'room-7', 'flowattr.priority': 'high' },
        });
        const token = yield* flow.send('server', { offer: 'sdp' });
        expect(token.to).toBe('server');
        const activation = yield* flow.activation.start('Call');
        yield* activation.end(Activation.completed());
      }).pipe(Effect.withLogger(logger)),
    );

    expect(annotations).toEqual([
      {
        'flowattr.priority': 'high',
        'flowattr.roomId': 'room-7',
        'http.request.method': 'POST',
        'flow.id': 'call-123',
        'flow.item.type': 'local-event',
        'flow.participant.name': 'client-a',
      },
      {
        'flow.id': 'call-123',
        'flow.item.type': 'message',
        'flow.message.id': expect.any(String),
        'flow.message.to': 'server',
        'flow.participant.name': 'client-a',
      },
      {
        'flow.id': 'call-123',
        'flow.item.type': 'activation-start',
        'flow.participant.name': 'client-a',
      },
      {
        'flow.activation.outcome': 'completed',
        'flow.id': 'call-123',
        'flow.item.type': 'activation-end',
        'flow.participant.name': 'client-a',
      },
    ]);
  });

  it('derives an Activation outcome from the effect exit', async () => {
    const recorder = makeTraceRecorder();
    const flow = initFlow({ id: 'call-123', participantName: 'client-a' });

    await Effect.runPromise(
      recorder.instrument(
        Effect.fail('boom').pipe(
          flow.activated({ name: 'Sync lifecycle' }),
          Effect.ignore,
        ),
      ),
    );

    const recorded = recorder.snapshotFlow('call-123')!;
    expect(recorded.activations).toEqual([
      {
        participantName: 'client-a',
        name: 'Sync lifecycle',
        startItemId: expect.any(String),
        endItemId: expect.any(String),
        startTimestamp: expect.any(Number),
        endTimestamp: expect.any(Number),
        outcome: 'failed',
      },
    ]);
  });

  it('warns when a Participant opens a second Activation', async () => {
    const recorder = makeTraceRecorder();
    const flow = initFlow({ id: 'call-123', participantName: 'client-a' });

    await Effect.runPromise(
      recorder.instrument(
        Effect.gen(function* () {
          yield* flow.activation.start('First');
          yield* flow.activation.start('Second');
        }),
      ),
    );

    const recorded = recorder.snapshotFlow('call-123')!;
    expect(recorded.warnings.map(({ message }) => message)).toEqual([
      'Activation started while "First" was still open.',
    ]);
    expect(recorded.activations.map(({ name }) => name)).toEqual([
      'First',
      'Second',
    ]);
  });

  it('warns when a Message targets a Participant that records nothing', async () => {
    const recorder = makeTraceRecorder();
    const flow = initFlow({ id: 'call-123', participantName: 'client-a' });

    await Effect.runPromise(recorder.instrument(flow.send('ghost', 'hello')));

    expect(recorder.snapshotFlow('call-123')!.warnings).toEqual([
      {
        recordType: 'log',
        recordId: expect.any(String),
        message: 'Message sent to "ghost", which records nothing in this Flow.',
      },
    ]);
  });

  it('marks only Flow activities with Flow span attributes', async () => {
    const recorder = makeTraceRecorder();
    const flow = initFlow({ id: 'call-123', participantName: 'client-a' });

    await Effect.runPromise(
      recorder.instrument(
        Effect.gen(function* () {
          yield* Effect.void.pipe(Effect.withSpan('ordinary-child'));
        }).pipe(
          flow.withSpan('Create offer', {
            attributes: { 'http.request.method': 'POST' },
            flowAttributes: { requestId: 'request-7' },
          }),
        ),
      ),
    );

    const spans = recorder.snapshot().spans;
    expect(
      spans.find(({ name }) => name === 'Create offer')?.attributes,
    ).toEqual({
      'flow.id': 'call-123',
      'flow.participant.name': 'client-a',
      'flowattr.requestId': 'request-7',
      'http.request.method': 'POST',
    });
    expect(
      spans.find(({ name }) => name === 'ordinary-child')?.attributes,
    ).toEqual({});
  });
});

describe('projectFlow', () => {
  it('orders observations and reports malformed Flow records', () => {
    const flow = projectFlow({
      id: 'call-123',
      latestTimestamp: 10,
      observations: [
        {
          source: 'log',
          recordId: 'later',
          participantName: 'client',
          name: 'Later',
          timestamp: 1,
          order: '2',
          severity: 'info',
        },
        {
          source: 'log',
          recordId: 'earlier',
          participantName: 'client',
          name: 'Earlier',
          timestamp: 1,
          order: '1',
          severity: 'info',
        },
        {
          source: 'log',
          recordId: 'bad-message',
          participantName: 'client',
          name: 'Send',
          timestamp: 2,
          order: '3',
          severity: 'info',
          itemType: 'message',
        },
        {
          source: 'log',
          recordId: 'bad-activation',
          participantName: 'client',
          name: 'End',
          timestamp: 3,
          order: '4',
          severity: 'info',
          itemType: 'activation-end',
        },
      ],
    });

    expect(flow.items.map(({ name }) => name)).toEqual(['Earlier', 'Later']);
    expect(flow.warnings.map(({ message }) => message)).toEqual([
      'Flow Message is missing flow.message.to.',
      'Activation End is missing flow.activation.outcome.',
    ]);
  });

  it('produces values accepted by the public Recorded Flow schema', () => {
    const flow = projectFlow({
      id: 'call-123',
      latestTimestamp: 1,
      observations: [
        {
          source: 'log',
          recordId: 'event-1',
          participantName: 'client',
          name: 'Created',
          timestamp: 1,
          order: '1',
          severity: 'info',
        },
      ],
    });

    expect(Schema.decodeUnknownSync(RecordedFlowSchema)(flow)).toEqual(flow);
    expect(() =>
      Schema.decodeUnknownSync(RecordedFlowSchema)({
        ...flow,
        items: [{ kind: 'message' }],
      }),
    ).toThrow();
  });
});
