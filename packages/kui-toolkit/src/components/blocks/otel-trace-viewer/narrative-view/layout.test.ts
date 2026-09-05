import { describe, expect, it } from 'vitest';
import type { OtelSpan, SpanNode } from '../trace-model';
import {
  buildNarrativeItems,
  defaultOpenSpanIds,
  narrativeHeadline,
} from './layout';

const span = (
  spanId: string,
  startTime: number,
  overrides: Partial<OtelSpan> = {},
): OtelSpan => ({
  traceId: 'trace-1',
  spanId,
  parentSpanId: null,
  name: spanId,
  startTime,
  endTime: startTime + 10,
  status: 'success',
  attributes: {},
  events: [],
  ...overrides,
});

const node = (
  spanId: string,
  startTime: number,
  overrides: Partial<OtelSpan> = {},
  children: SpanNode[] = [],
): SpanNode => ({ span: span(spanId, startTime, overrides), children });

describe('narrativeHeadline', () => {
  it('prefers the narrative attribute over the span name', () => {
    expect(
      narrativeHeadline(
        span('s1', 0, { attributes: { narrative: 'Fetching the catalog' } }),
      ),
    ).toBe('Fetching the catalog');
  });

  it('falls back to the span name when the narrative is missing or blank', () => {
    expect(narrativeHeadline(span('s1', 0))).toBe('s1');
    expect(
      narrativeHeadline(span('s1', 0, { attributes: { narrative: '  ' } })),
    ).toBe('s1');
  });
});

describe('buildNarrativeItems', () => {
  it('interleaves events and children chronologically', () => {
    const parent = node(
      'parent',
      0,
      {
        endTime: 100,
        events: [
          { name: 'log', timestamp: 5, attributes: { body: 'starting' } },
          { name: 'log', timestamp: 60, attributes: { body: 'wrapping up' } },
        ],
      },
      [node('early', 10), node('late', 40)],
    );

    expect(
      buildNarrativeItems(parent).map((item) =>
        item.kind === 'event'
          ? `event@${item.timestamp}`
          : `spans@${item.timestamp}:${item.nodes.map((n) => n.span.spanId).join(',')}`,
      ),
    ).toEqual(['event@5', 'spans@10:early', 'spans@40:late', 'event@60']);
  });

  it('groups overlapping siblings into one parallel item', () => {
    const parent = node('parent', 0, { endTime: 100 }, [
      node('a', 10, { endTime: 50 }),
      node('b', 20, { endTime: 60 }),
      node('after', 70),
    ]);

    const items = buildNarrativeItems(parent);
    expect(
      items.map((item) =>
        item.kind === 'spans'
          ? item.nodes.map((n) => n.span.spanId).join(',')
          : 'event',
      ),
    ).toEqual(['a,b', 'after']);
  });

  it('treats a running child as overlapping everything after it', () => {
    const parent = node('parent', 0, { endTime: null }, [
      node('running', 10, { endTime: null }),
      node('later', 500),
    ]);

    const items = buildNarrativeItems(parent);
    expect(items).toHaveLength(1);
    expect(items[0]!.kind === 'spans' && items[0]!.nodes).toHaveLength(2);
  });
});

describe('defaultOpenSpanIds', () => {
  it('opens the first root when nothing errored', () => {
    expect(defaultOpenSpanIds([node('r1', 0), node('r2', 20)])).toEqual(
      new Set(['r1']),
    );
  });

  it('opens the path down to the deepest erroring span', () => {
    const roots = [
      node('healthy', 0),
      node('root', 10, {}, [
        node('fine', 11),
        node('broken', 12, { status: 'error' }, [
          node('cause', 13, { status: 'error' }),
          node('bystander', 14),
        ]),
      ]),
    ];

    expect(defaultOpenSpanIds(roots)).toEqual(
      new Set(['root', 'broken', 'cause']),
    );
  });

  it('is empty for an empty trace', () => {
    expect(defaultOpenSpanIds([])).toEqual(new Set());
  });
});
