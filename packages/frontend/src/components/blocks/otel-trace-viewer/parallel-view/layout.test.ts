import { describe, expect, it } from 'vitest';
import type { OtelSpan, SpanNode } from '../trace-model';
import { buildParallelTracks } from './layout';

const span = (
  spanId: string,
  startTime: number,
  endTime: number,
): OtelSpan => ({
  traceId: 'trace',
  spanId,
  parentSpanId: null,
  name: spanId,
  startTime,
  endTime,
  status: 'success',
  attributes: {},
  events: [],
});

const node = (value: OtelSpan, children: SpanNode[] = []): SpanNode => ({
  span: value,
  children,
});

describe('buildParallelTracks', () => {
  it('keeps every tree depth in a separate track', () => {
    const root = span('root', 0, 100);
    const child = { ...span('child', 10, 80), parentSpanId: root.spanId };
    const nested = { ...span('nested', 20, 40), parentSpanId: child.spanId };
    const tracks = buildParallelTracks(
      [node(root, [node(child, [node(nested)])])],
      0,
      100,
    );

    expect(
      tracks.map(({ spans }) => spans.map(({ span }) => span.spanId)),
    ).toEqual([['root'], ['child'], ['nested']]);
  });

  it('packs only connected overlap clusters into sub-lanes', () => {
    const root = span('root', 0, 100);
    const tracks = buildParallelTracks(
      [
        node(root, [
          node({ ...span('first', 10, 60), parentSpanId: root.spanId }),
          node({ ...span('second', 20, 70), parentSpanId: root.spanId }),
          node({ ...span('later', 80, 90), parentSpanId: root.spanId }),
        ]),
      ],
      0,
      100,
    );

    const childTrack = tracks[1]!;
    expect(childTrack.clusters.map(({ laneCount }) => laneCount)).toEqual([
      2, 1,
    ]);
    expect(childTrack.spans.map(({ lane }) => lane)).toEqual([0, 1, 0]);
    expect(childTrack.spans[0]!.clusterKey).toBe(
      childTrack.spans[1]!.clusterKey,
    );
    expect(childTrack.spans[2]!.clusterKey).not.toBe(
      childTrack.spans[0]!.clusterKey,
    );
  });

  it('preserves waterfall order within a depth', () => {
    const root = span('root', 0, 100);
    const tracks = buildParallelTracks(
      [
        node(root, [
          node({ ...span('longer-first', 10, 80), parentSpanId: root.spanId }),
          node({
            ...span('shorter-second', 10, 40),
            parentSpanId: root.spanId,
          }),
        ]),
      ],
      0,
      100,
    );

    expect(tracks[1]!.spans.map(({ span: child }) => child.spanId)).toEqual([
      'longer-first',
      'shorter-second',
    ]);
  });
});
