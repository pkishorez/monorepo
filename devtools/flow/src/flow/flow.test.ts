import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import { FlowTelemetry } from '../telemetry/index.js';
import { projectJournal } from '../projection/index.js';
import { Activation, Flow } from './index.js';

const memory = () => FlowTelemetry.makeMemory({ origin: 'test' });

describe('Flow', () => {
  it('records nothing without a sink and still hands out tokens', async () => {
    const flow = Flow.make({ id: 'quiet' });
    const token = await Effect.runPromise(
      flow.participant('a').send('b', 'hello'),
    );
    expect(token).toMatchObject({ from: 'a', to: 'b' });
    expect(token.id).toMatch(/-/);
  });

  it('writes every entry kind with the flow, participant, sequence, and origin', async () => {
    const sink = memory();
    const flow = Flow.make({ id: 'transfer:1' });
    const user = flow.participant('app/user');
    const bank = flow.participant('app/bank');

    await Effect.runPromise(
      Effect.gen(function* () {
        const ask = yield* user.send(bank, 'Transfer 10', {
          attributes: { amount: 10 },
        });
        yield* bank.activated('Process transfer')(
          Effect.gen(function* () {
            yield* bank.event('Validated');
            yield* bank.check('amount is positive', true);
            yield* bank.waiting('network')(Effect.void);
            yield* bank.reply(ask, 'Settled');
          }),
        );
        yield* user.close();
      }).pipe(Effect.provideService(FlowTelemetry, sink)),
    );

    const journal = sink.journal('transfer:1')!;
    expect(journal.entries.map((entry) => entry.kind)).toEqual([
      'message',
      'activation-start',
      'event',
      'check',
      'wait',
      'resume',
      'message',
      'activation-end',
      'close',
    ]);
    expect(journal.entries.map((entry) => entry.sequence)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9,
    ]);
    expect(journal.entries.every((entry) => entry.origin === 'test')).toBe(
      true,
    );
    const [ask, , , , , , reply, end] = journal.entries;
    expect(ask).toMatchObject({
      destination: 'app/bank',
      attributes: { amount: 10 },
    });
    expect(reply).toMatchObject({
      kind: 'message',
      destination: 'app/user',
      replyTo: (ask as { messageId: string }).messageId,
    });
    expect(end).toMatchObject({ kind: 'activation-end', outcome: 'completed' });
  });

  it('derives the activation outcome from the exit', async () => {
    const sink = memory();
    const flow = Flow.make({ id: 'fails' });
    await Effect.runPromise(
      Effect.fail('boom').pipe(
        flow.participant('worker').activated('Job'),
        Effect.ignore,
        Effect.provideService(FlowTelemetry, sink),
      ),
    );
    const projection = projectJournal(sink.journal('fails')!);
    expect(projection.activations).toMatchObject([
      { name: 'Job', outcome: 'failed', participantName: 'worker' },
    ]);
    expect(projection.status).toBe('failed');
    expect(projection.items.at(-1)).toMatchObject({
      attributes: { error: 'boom' },
    });
  });

  it('supports manual activations that outlive a fiber', async () => {
    const sink = memory();
    const flow = Flow.make({ id: 'manual' });
    const worker = flow.participant('worker');
    await Effect.runPromise(
      Effect.gen(function* () {
        const activation = yield* worker.activation.start('Session');
        yield* worker.wait('leadership');
        yield* activation.end(Activation.interrupted('teardown'));
      }).pipe(Effect.provideService(FlowTelemetry, sink)),
    );
    const projection = projectJournal(sink.journal('manual')!);
    expect(projection.activations[0]).toMatchObject({
      outcome: 'interrupted',
      endItemId: expect.any(String),
    });
    // The Activation End closes the Wait at its own row.
    expect(projection.waits[0]).toMatchObject({
      name: 'leadership',
      endItemId: projection.activations[0]?.endItemId,
    });
    expect(projection.warnings).toEqual([]);
  });

  it('stamps the trace link when recorded inside a span', async () => {
    const sink = memory();
    const flow = Flow.make({ id: 'traced' });
    await Effect.runPromise(
      flow
        .participant('worker')
        .event('inside')
        .pipe(
          Effect.withSpan('work'),
          Effect.provideService(FlowTelemetry, sink),
        ),
    );
    const [entry] = sink.journal('traced')!.entries;
    expect(entry?.traceId).toMatch(/^[0-9a-f]+$/);
    expect(entry?.spanId).toMatch(/^[0-9a-f]+$/);
  });

  it('returns the same participant for the same name', () => {
    const flow = Flow.make({ id: 'same' });
    expect(flow.participant('a')).toBe(flow.participant('a'));
  });
});
