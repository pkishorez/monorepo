import { describe, expect, it } from 'vitest';
import { groupByTrace } from './trace-model';
import type { OtelSpan } from './types';

const span = (
  spanId: string,
  startTime: number,
  parentSpanId: string | null,
): OtelSpan => ({
  traceId: 'trace-1',
  spanId,
  parentSpanId,
  name: spanId,
  startTime,
  endTime: startTime + 1,
  status: 'success',
  attributes: {},
  events: [],
});

describe('groupByTrace', () => {
  it('sorts roots and siblings chronologically while preserving subtrees', () => {
    const [trace] = groupByTrace([
      span('late-child', 40, 'root'),
      span('late-root', 50, null),
      span('early-grandchild', 25, 'early-child'),
      span('root', 10, null),
      span('early-child', 20, 'root'),
      span('middle-child', 30, 'root'),
    ]);

    expect(trace?.roots.map(({ span }) => span.spanId)).toEqual([
      'root',
      'late-root',
    ]);
    expect(trace?.roots[0]?.children.map(({ span }) => span.spanId)).toEqual([
      'early-child',
      'middle-child',
      'late-child',
    ]);
    expect(trace?.roots[0]?.children[0]?.children[0]?.span.spanId).toBe(
      'early-grandchild',
    );
  });
});

it('includes children that outlive an interrupted root in trace duration', () => {
  const root = { ...span('root', 0, null), endTime: 34 };
  const child = { ...span('server', 53, 'root'), endTime: 15443 };
  const [trace] = groupByTrace([root, child]);
  expect(trace).toMatchObject({
    startTime: 0,
    endTime: 15443,
    duration: 15443,
  });
  expect(trace?.roots[0]?.span.endTime).toBe(34);
});

it('keeps a trace running while a child outlives its completed root', () => {
  const [trace] = groupByTrace([
    span('root', 0, null),
    { ...span('child', 1, 'root'), endTime: null, status: 'running' },
  ]);
  expect(trace).toMatchObject({
    status: 'running',
    endTime: null,
    duration: null,
  });
});
