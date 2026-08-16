import { describe, expect, it } from 'vitest';

import { makeFlowSteps } from './event-summary';
import type { RecordedFlow } from './model';

type RecordedFlowItem = RecordedFlow['items'][number];

const event = (
  id: string,
  participantName: string,
  name = 'Write',
): RecordedFlowItem => ({
  id,
  kind: 'local-event',
  name,
  participantName,
  severity: 'info',
  timestamp: Number(id),
});

const message = (id: string, participantName: string): RecordedFlowItem => ({
  id,
  kind: 'message',
  destination: 'backend',
  messageId: id,
  name: 'Fetch',
  participantName,
  severity: 'info',
  timestamp: Number(id),
});

describe('makeFlowSteps', () => {
  it('does not collapse a run of only two steps', () => {
    const steps = makeFlowSteps(
      [event('1', 'replica', 'Read'), event('2', 'replica', 'Write')],
      new Set(['1']),
    );

    expect(steps).toHaveLength(2);
    expect(steps.every(({ summaryId }) => summaryId === undefined)).toBe(true);
  });

  it('collapses three or more adjacent steps and retains every member', () => {
    const steps = makeFlowSteps(
      [
        event('1', 'replica', 'Read'),
        event('2', 'replica', 'Merge'),
        event('3', 'replica', 'Write'),
      ],
      new Set(['1']),
    );

    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({
      id: '1',
      kind: 'summary',
      name: '3 steps',
      repeatCount: 3,
      summaryId: '1',
    });
    expect(steps[0]?.members.map(({ id }) => id)).toEqual(['1', '2', '3']);
  });

  it('does not summarize across an intervening Participant', () => {
    const steps = makeFlowSteps(
      [event('1', 'replica'), event('2', 'backend'), event('3', 'replica')],
      new Set(),
    );

    expect(steps.map(({ repeatCount }) => repeatCount)).toEqual([1, 1, 1]);
  });

  it('never summarizes Messages and treats them as run boundaries', () => {
    const steps = makeFlowSteps(
      [
        event('1', 'replica'),
        event('2', 'replica'),
        event('3', 'replica'),
        message('4', 'replica'),
        event('5', 'replica'),
        event('6', 'replica'),
        event('7', 'replica'),
      ],
      new Set(['1', '5']),
    );

    expect(steps.map(({ id, kind }) => [id, kind])).toEqual([
      ['1', 'summary'],
      ['4', 'message'],
      ['5', 'summary'],
    ]);
    expect(steps[1]?.members).toEqual([message('4', 'replica')]);
  });

  it('exposes every member when a summary is expanded', () => {
    const steps = makeFlowSteps(
      [event('1', 'replica'), event('2', 'replica'), event('3', 'replica')],
      new Set(),
    );

    expect(steps.map(({ id, summaryId }) => [id, summaryId])).toEqual([
      ['1', '1'],
      ['2', '1'],
      ['3', '1'],
    ]);
  });
});
