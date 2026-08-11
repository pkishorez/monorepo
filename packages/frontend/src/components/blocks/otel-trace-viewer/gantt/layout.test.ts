import { describe, expect, it } from 'vitest';
import type { OtelSpan, SpanNode } from '../trace-model';
import { buildGanttRows, defaultCollapsedSpanIds } from './layout';

const span = (spanId: string, startTime: number): OtelSpan => ({
  traceId: 'trace-1',
  spanId,
  parentSpanId: null,
  name: spanId,
  startTime,
  endTime: startTime + 1,
  status: 'success',
  attributes: {},
  events: [],
});

const node = (
  spanId: string,
  startTime: number,
  children: SpanNode[] = [],
): SpanNode => ({ span: span(spanId, startTime), children });

describe('defaultCollapsedSpanIds', () => {
  it('shows roots and their direct children while collapsing deeper branches', () => {
    const roots = [
      node('root', 0, [
        node('child', 1, [node('grandchild', 2, [node('leaf', 3)])]),
        node('sibling', 4),
      ]),
    ];
    const collapsed = defaultCollapsedSpanIds(roots);

    expect([...collapsed]).toEqual(['child', 'grandchild']);
    expect(
      buildGanttRows(roots, 0, 5, collapsed).map(({ span }) => span.spanId),
    ).toEqual(['root', 'child', 'sibling']);
  });
});
