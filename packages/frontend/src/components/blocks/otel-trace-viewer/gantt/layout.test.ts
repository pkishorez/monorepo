import { describe, expect, it } from 'vitest';
import type { OtelSpan, SpanNode } from '../trace-model';
import { buildGanttRows } from './layout';

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

describe('buildGanttRows', () => {
  it('shows the full span tree when no spans are collapsed', () => {
    const roots = [
      node('root', 0, [
        node('child', 1, [node('grandchild', 2, [node('leaf', 3)])]),
        node('sibling', 4),
      ]),
    ];

    expect(buildGanttRows(roots, 0, 5).map(({ span }) => span.spanId)).toEqual([
      'root',
      'child',
      'grandchild',
      'leaf',
      'sibling',
    ]);
  });
});

describe('buildGanttRows inline logs', () => {
  it("interleaves a span's logs with its children by timestamp", () => {
    const log = (timestamp: number, body: string) => ({
      name: 'log',
      timestamp,
      attributes: { body, severityText: 'INFO' },
    });
    const parent: SpanNode = {
      span: {
        ...span('parent', 0),
        endTime: 100,
        events: [log(5, 'starting'), log(60, 'wrapping up')],
      },
      children: [node('early', 10), node('late', 40)],
    };

    const rows = buildGanttRows([parent], 0, 100, new Set(), true);
    expect(
      rows.map((row) =>
        row.kind === 'span'
          ? row.span.spanId
          : `log@${row.event.timestamp}:${row.depth}`,
      ),
    ).toEqual(['parent', 'log@5:1', 'early', 'late', 'log@60:1']);
  });

  it('emits no log rows when inline logs are off', () => {
    const parent: SpanNode = {
      span: {
        ...span('parent', 0),
        events: [{ name: 'log', timestamp: 5, attributes: { body: 'x' } }],
      },
      children: [],
    };
    expect(buildGanttRows([parent], 0, 100)).toHaveLength(1);
  });
});
