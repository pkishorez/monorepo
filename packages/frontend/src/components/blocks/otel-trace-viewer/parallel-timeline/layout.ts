import type { OtelSpan, SpanNode } from '../trace-model';

export interface OverlapCluster {
  readonly key: string;
  readonly laneCount: number;
  readonly spanIds: ReadonlySet<string>;
}

export interface ParallelSpan {
  readonly span: OtelSpan;
  readonly clusterKey: string;
  readonly lane: number;
  readonly startPct: number;
  readonly widthPct: number;
}

export interface ParallelTrack {
  readonly depth: number;
  readonly clusters: readonly OverlapCluster[];
  readonly spans: readonly ParallelSpan[];
}

interface PendingSpan {
  readonly span: OtelSpan;
  readonly order: number;
}

function collect(
  nodes: readonly SpanNode[],
  byDepth = new Map<number, PendingSpan[]>(),
  depth = 0,
  order = { current: 0 },
): Map<number, PendingSpan[]> {
  for (const node of nodes) {
    const spans = byDepth.get(depth) ?? [];
    spans.push({ span: node.span, order: order.current++ });
    byDepth.set(depth, spans);
    collect(node.children, byDepth, depth + 1, order);
  }
  return byDepth;
}

function buildClusters(items: readonly PendingSpan[], traceEnd: number) {
  const sorted = [...items].sort(
    (left, right) =>
      left.span.startTime - right.span.startTime || left.order - right.order,
  );
  const clusters: PendingSpan[][] = [];
  let clusterEnd = Number.NEGATIVE_INFINITY;

  for (const item of sorted) {
    if (clusters.length === 0 || item.span.startTime >= clusterEnd) {
      clusters.push([item]);
      clusterEnd = item.span.endTime ?? traceEnd;
    } else {
      clusters.at(-1)!.push(item);
      clusterEnd = Math.max(clusterEnd, item.span.endTime ?? traceEnd);
    }
  }

  return clusters;
}

export function buildParallelTracks(
  roots: readonly SpanNode[],
  traceStart: number,
  traceEnd: number,
): ParallelTrack[] {
  const duration = Math.max(traceEnd - traceStart, 1);
  const byDepth = collect(roots);

  return [...byDepth.entries()]
    .sort(([left], [right]) => left - right)
    .map(([depth, items]) => {
      const parallelSpans: ParallelSpan[] = [];
      const clusters = buildClusters(items, traceEnd).map(
        (clusterItems, clusterIndex) => {
          const lanes: Array<Array<{ start: number; end: number }>> = [];
          const orderedItems = [...clusterItems].sort(
            (left, right) => left.order - right.order,
          );
          const key = `${depth}:${clusterIndex}`;

          for (const { span } of orderedItems) {
            const end = span.endTime ?? traceEnd;
            let lane = lanes.findIndex((intervals) =>
              intervals.every(
                (interval) =>
                  end <= interval.start || span.startTime >= interval.end,
              ),
            );
            if (lane === -1) {
              lane = lanes.length;
              lanes.push([]);
            }
            lanes[lane]!.push({ start: span.startTime, end });
            parallelSpans.push({
              span,
              clusterKey: key,
              lane,
              startPct: (span.startTime - traceStart) / duration,
              widthPct: Math.max((end - span.startTime) / duration, 0.002),
            });
          }

          return {
            key,
            laneCount: Math.max(lanes.length, 1),
            spanIds: new Set(orderedItems.map(({ span }) => span.spanId)),
          };
        },
      );

      parallelSpans.sort(
        (left, right) =>
          items.find(({ span }) => span.spanId === left.span.spanId)!.order -
          items.find(({ span }) => span.spanId === right.span.spanId)!.order,
      );
      return { depth, clusters, spans: parallelSpans };
    });
}
