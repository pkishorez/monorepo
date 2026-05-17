import type { OtelSpan, OtelStatus } from './types';

export function formatDuration(ms: number | null): string {
  if (ms === null) return '—';
  if (ms < 1) return '< 1ms';
  if (ms < 1_000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1_000).toFixed(2)}s`;
  if (ms < 3_600_000) return `${(ms / 60_000).toFixed(1)}m`;
  if (ms < 86_400_000) return `${(ms / 3_600_000).toFixed(1)}h`;
  return `${(ms / 86_400_000).toFixed(1)}d`;
}

export function spanDuration(span: OtelSpan): number | null {
  if (span.endTime === null) return null;
  return span.endTime - span.startTime;
}

export function formatSpanName(
  name: string,
  attributes: Record<string, unknown>,
): string {
  if (/^http\.(client|server)\s/.test(name)) {
    const path = attributes['url.path'];
    if (typeof path === 'string') return `${name} ${path}`;
  }
  return name;
}

export type SpanNode = {
  span: OtelSpan;
  children: SpanNode[];
};

export type TraceGroup = {
  traceId: string;
  name: string;
  serviceName: string | null;
  status: OtelStatus;
  spanCount: number;
  duration: number | null;
  startTime: number;
  endTime: number | null;
  roots: SpanNode[];
  missingRoot: boolean;
};

function buildSpanTree(spans: OtelSpan[]): SpanNode[] {
  const nodeMap = new Map<string, SpanNode>();
  const spanIds = new Set(spans.map((s) => s.spanId));

  for (const span of spans) {
    nodeMap.set(span.spanId, { span, children: [] });
  }

  const roots: SpanNode[] = [];
  for (const span of spans) {
    const node = nodeMap.get(span.spanId)!;
    if (span.parentSpanId === null) {
      roots.push(node);
    } else if (spanIds.has(span.parentSpanId)) {
      nodeMap.get(span.parentSpanId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

function deriveTraceStatus(spans: OtelSpan[]): OtelStatus {
  if (spans.some((s) => s.status === 'error')) return 'error';
  if (spans.some((s) => s.status === 'running')) return 'running';
  if (spans.some((s) => s.status === 'success')) return 'success';
  return 'unset';
}

export function groupByTrace(spans: OtelSpan[]): TraceGroup[] {
  const byTrace = new Map<string, OtelSpan[]>();

  for (const span of spans) {
    if (!byTrace.has(span.traceId)) byTrace.set(span.traceId, []);
    byTrace.get(span.traceId)!.push(span);
  }

  return Array.from(byTrace.entries()).map(([traceId, traceSpans]) => {
    const roots = buildSpanTree(traceSpans);
    const startTimes = traceSpans.map((s) => s.startTime);
    const endTimes = traceSpans.map((s) => s.endTime);
    const hasRunning = endTimes.some((e) => e === null);
    const minStart = Math.min(...startTimes);
    const maxEnd = hasRunning
      ? null
      : Math.max(...endTimes.filter((e): e is number => e !== null));

    const rootSpan = traceSpans.find((s) => s.parentSpanId === null);
    const missingRoot = rootSpan === undefined;
    const anchor = rootSpan ?? traceSpans[0]!;
    const rawServiceName = anchor.attributes['resource.service.name'];
    const serviceName =
      typeof rawServiceName === 'string' ? rawServiceName : null;
    const rootNode = roots[0];
    const name = rootNode
      ? formatSpanName(rootNode.span.name, rootNode.span.attributes)
      : traceId;

    return {
      traceId,
      name,
      serviceName,
      status: deriveTraceStatus(traceSpans),
      spanCount: traceSpans.length,
      duration: maxEnd !== null ? maxEnd - minStart : null,
      startTime: minStart,
      endTime: maxEnd,
      roots,
      missingRoot,
    };
  });
}

export function collectSpans(nodes: SpanNode[]): OtelSpan[] {
  const result: OtelSpan[] = [];
  function visit(node: SpanNode) {
    result.push(node.span);
    node.children.forEach(visit);
  }
  nodes.forEach(visit);
  return result;
}
