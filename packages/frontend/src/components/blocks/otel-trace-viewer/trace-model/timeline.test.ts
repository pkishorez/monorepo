import { describe, expect, it } from 'vitest';
import type { OtelSpan } from './types';
import { spanTimelineBounds } from './timeline';

const span = (
  spanId: string,
  startTime: number,
  endTime: number | null,
): OtelSpan => ({
  traceId: 'trace-1',
  spanId,
  parentSpanId: null,
  name: spanId,
  startTime,
  endTime,
  status: endTime === null ? 'running' : 'success',
  attributes: {},
  events: [],
});

describe('spanTimelineBounds', () => {
  it('uses the largest completed end for running spans', () => {
    expect(
      spanTimelineBounds(
        [span('running', 10, null), span('complete', 12, 30)],
        0,
      ),
    ).toEqual({ traceStart: 10, traceEnd: 30 });
  });

  it('includes a running span that starts after every completed span', () => {
    expect(
      spanTimelineBounds(
        [span('complete', 10, 20), span('running', 40, null)],
        0,
      ),
    ).toEqual({ traceStart: 10, traceEnd: 40 });
  });

  it('uses the latest start when every span is running', () => {
    expect(
      spanTimelineBounds(
        [span('first', 10, null), span('second', 25, null)],
        0,
      ),
    ).toEqual({ traceStart: 10, traceEnd: 25 });
  });
});
