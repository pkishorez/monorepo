import type { OtelEvent, OtelSpan, SpanNode } from '../trace-model';
import { formatSpanName } from '../trace-model';

export const NARRATIVE_ATTRIBUTE = 'narrative';

export function narrativeHeadline(span: OtelSpan): string {
  const value = span.attributes[NARRATIVE_ATTRIBUTE];
  if (typeof value === 'string' && value.trim() !== '') return value;
  return formatSpanName(span.name, span.attributes);
}

export type NarrativeItem =
  | {
      readonly kind: 'event';
      readonly timestamp: number;
      readonly event: OtelEvent;
    }
  | {
      readonly kind: 'spans';
      readonly timestamp: number;
      /** More than one node means the spans ran in parallel. */
      readonly nodes: readonly SpanNode[];
    };

/** Group siblings whose time ranges (transitively) overlap. */
function clusterByOverlap(children: readonly SpanNode[]): SpanNode[][] {
  const sorted = [...children].sort(
    (left, right) =>
      left.span.startTime - right.span.startTime ||
      left.span.spanId.localeCompare(right.span.spanId),
  );
  const clusters: SpanNode[][] = [];
  let clusterEnd = Number.NEGATIVE_INFINITY;

  for (const node of sorted) {
    const end = node.span.endTime ?? Number.POSITIVE_INFINITY;
    if (clusters.length === 0 || node.span.startTime >= clusterEnd) {
      clusters.push([node]);
      clusterEnd = end;
    } else {
      clusters.at(-1)!.push(node);
      clusterEnd = Math.max(clusterEnd, end);
    }
  }

  return clusters;
}

/**
 * A span's story: its own events and its children, interleaved in the order
 * they actually happened.
 */
export function buildNarrativeItems(node: SpanNode): NarrativeItem[] {
  const items: NarrativeItem[] = node.span.events.map((event) => ({
    kind: 'event',
    timestamp: event.timestamp,
    event,
  }));
  for (const cluster of clusterByOverlap(node.children)) {
    items.push({
      kind: 'spans',
      timestamp: cluster[0]!.span.startTime,
      nodes: cluster,
    });
  }
  return items.sort((left, right) => left.timestamp - right.timestamp);
}

function subtreeHasError(node: SpanNode): boolean {
  return node.span.status === 'error' || node.children.some(subtreeHasError);
}

function errorPath(nodes: readonly SpanNode[]): readonly string[] | null {
  for (const node of nodes) {
    if (!subtreeHasError(node)) continue;
    const rest = errorPath(node.children);
    return [node.span.spanId, ...(rest ?? [])];
  }
  return null;
}

/**
 * Initially open spans: the path down to the deepest erroring span so the
 * failure story is immediately readable, otherwise just the first root.
 */
export function defaultOpenSpanIds(
  roots: readonly SpanNode[],
): ReadonlySet<string> {
  const path = errorPath(roots);
  if (path) return new Set(path);
  const first = roots[0];
  return new Set(first ? [first.span.spanId] : []);
}
