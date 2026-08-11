import { describe, expect, it } from 'vitest';
import { groupByTrace } from './trace-group';
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
