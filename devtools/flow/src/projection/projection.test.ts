import { describe, expect, it } from 'vitest';
import type { Entry } from '../journal/index.js';
import { projectJournal } from './projection.js';

let sequence = 0;
const entry = <K extends Entry['kind']>(
  kind: K,
  fields: Partial<Extract<Entry, { kind: K }>> & { participantName: string },
): Entry => {
  sequence += 1;
  return {
    id: `e${sequence}`,
    flowId: 'f',
    name: kind,
    sequence,
    timestamp: sequence,
    severity: 'info',
    kind,
    ...fields,
  } as Entry;
};

describe('projectJournal', () => {
  it('warns only about authoring mistakes', () => {
    const projection = projectJournal({
      flowId: 'f',
      ordering: 'recorded',
      entries: [
        entry('activation-start', { participantName: 'a', activationId: '1' }),
        entry('activation-start', { participantName: 'a', activationId: '2' }),
        entry('activation-end', {
          participantName: 'b',
          activationId: '9',
          outcome: 'completed',
        }),
        entry('message', {
          participantName: 'a',
          messageId: 'm2',
          destination: 'b',
          replyTo: 'm1',
        }),
        entry('resume', { participantName: 'a' }),
        entry('wait', { participantName: 'a' }),
      ],
    });
    expect(projection.warnings.map(({ message }) => message)).toEqual([
      'Activation started while "activation-start" was still open.',
      'Activation ended while none was open.',
      'Reply answers Message "m1", which this Journal does not contain.',
      'Resumed while no Wait was open.',
    ]);
    expect(projection.activations).toHaveLength(2);
    expect(projection.waits).toMatchObject([{ endItemId: null }]);
    expect(projection.status).toBe('active');
    expect(projection.participants).toEqual(['a', 'b']);
  });

  it('reports failed checks and close as status', () => {
    const closed = projectJournal({
      flowId: 'f',
      ordering: 'recorded',
      entries: [entry('close', { participantName: 'a' })],
    });
    expect(closed.status).toBe('closed');
    const failed = projectJournal({
      flowId: 'f',
      ordering: 'recorded',
      entries: [entry('check', { participantName: 'a', passed: false })],
    });
    expect(failed.status).toBe('failed');
  });

  it('preserves journal order when timestamps match', () => {
    const projection = projectJournal({
      flowId: 'f',
      ordering: 'recorded',
      entries: [
        entry('activation-start', {
          participantName: 'root',
          activationId: 'root',
          timestamp: 1,
        }),
        entry('activation-start', {
          participantName: 'child',
          activationId: 'child',
          timestamp: 1,
        }),
        entry('activation-end', {
          participantName: 'child',
          activationId: 'child',
          outcome: 'completed',
          timestamp: 1,
        }),
        entry('wait', { participantName: 'root', timestamp: 1 }),
        entry('wait', { participantName: 'child', timestamp: 1 }),
        entry('resume', { participantName: 'child', timestamp: 1 }),
      ],
    });

    expect(
      projection.activations.map(({ participantName }) => participantName),
    ).toEqual(['root', 'child']);
    expect(
      projection.waits.map(({ participantName }) => participantName),
    ).toEqual(['root', 'child']);
  });
});

describe('distributed journal projection', () => {
  it.each(['recorded', 'clock'] as const)(
    'resolves replies against the whole %s journal',
    (ordering) => {
      const projection = projectJournal({
        flowId: 'f',
        ordering,
        entries: [
          entry('message', {
            participantName: 'server',
            destination: 'client',
            messageId: 'reply',
            replyTo: 'request',
          }),
          entry('message', {
            participantName: 'client',
            destination: 'server',
            messageId: 'request',
          }),
        ],
      });
      expect(projection.warnings).toEqual([]);
    },
  );

  it('does not close another activation or its wait when an overlapped activation ends', () => {
    const entries = [
      entry('activation-start', {
        participantName: 'a',
        activationId: 'first',
      }),
      entry('activation-start', {
        participantName: 'a',
        activationId: 'second',
      }),
      entry('wait', { participantName: 'a' }),
      entry('activation-end', {
        participantName: 'a',
        activationId: 'first',
        outcome: 'failed',
      }),
    ];
    const pending = projectJournal({
      flowId: 'f',
      ordering: 'recorded',
      entries,
    });
    expect(pending.activations[1]).toMatchObject({
      activationId: 'second',
      endItemId: null,
      outcome: null,
    });
    expect(pending.waits[0]?.endItemId).toBeNull();
    expect(pending.warnings.map((warning) => warning.kind)).toEqual([
      'activation-overlap',
      'activation-orphan-end',
    ]);

    const end = entry('activation-end', {
      participantName: 'a',
      activationId: 'second',
      outcome: 'completed',
    });
    const completed = projectJournal({
      flowId: 'f',
      ordering: 'recorded',
      entries: [...entries, end],
    });
    expect(completed.activations[1]).toMatchObject({
      activationId: 'second',
      endItemId: end.id,
      outcome: 'completed',
    });
    expect(completed.waits[0]?.endItemId).toBe(end.id);
  });
});
