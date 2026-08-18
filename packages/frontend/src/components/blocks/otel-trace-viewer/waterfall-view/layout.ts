import type { OtelEvent, OtelSpan, SpanNode } from '../trace-model';
import { isLog } from '../trace-model';

export const NAME_COL_WIDTH = 248;
export const MIN_NAME_COL_WIDTH = 140;
export const MAX_NAME_COL_WIDTH = 640;
export const ROW_HEIGHT_PX = 36;
export const BAR_HEIGHT_PX = 18;
/** Minimum rendered width of a span bar so short spans stay visible/clickable. */
export const BAR_MIN_WIDTH_PX = 6;
export const INDENT_PX = 16;
export const BAR_COL_INSET = 10;

export type GanttSpanRow = {
  kind: 'span';
  span: OtelSpan;
  depth: number;
  startPct: number;
  widthPct: number;
  hasChildren: boolean;
  collapsed: boolean;
  /** Number of descendant spans hidden while this row is collapsed. */
  hiddenCount: number;
};

export type GanttLogEntry = {
  kind: 'log';
  /** The span the log belongs to. */
  span: OtelSpan;
  event: OtelEvent;
  depth: number;
};

export type GanttRow = GanttSpanRow | GanttLogEntry;

function countDescendants(node: SpanNode): number {
  let total = 0;
  for (const child of node.children) total += 1 + countDescendants(child);
  return total;
}

/** Collapse every branch below a root so the first child level stays visible. */
export function defaultCollapsedSpanIds(roots: readonly SpanNode[]) {
  const spanIds = new Set<string>();

  function visitDescendants(node: SpanNode) {
    for (const child of node.children) {
      if (child.children.length > 0) spanIds.add(child.span.spanId);
      visitDescendants(child);
    }
  }

  for (const root of roots) visitDescendants(root);
  return spanIds;
}

export function buildGanttRows(
  roots: SpanNode[],
  traceStart: number,
  traceEnd: number,
  collapsed?: ReadonlySet<string>,
  showLogs = false,
): GanttRow[] {
  const total = Math.max(traceEnd - traceStart, 1);
  const rows: GanttRow[] = [];

  function visit(node: SpanNode, depth: number) {
    const { span, children } = node;
    const startPct = (span.startTime - traceStart) / total;
    const rawEnd = span.endTime ?? traceEnd;
    const endPct = (rawEnd - traceStart) / total;
    const widthPct = Math.max(endPct - startPct, 0.002);
    const isCollapsed = depth > 0 && (collapsed?.has(span.spanId) ?? false);

    rows.push({
      kind: 'span',
      span,
      depth,
      startPct,
      widthPct,
      hasChildren: children.length > 0,
      collapsed: isCollapsed,
      hiddenCount: isCollapsed ? countDescendants(node) : 0,
    });

    if (isCollapsed) return;

    const logs = showLogs
      ? span.events
          .filter(isLog)
          .sort((left, right) => left.timestamp - right.timestamp)
      : [];

    // A span's rows tell its story in time order: children and its own logs
    // interleaved where they actually happened, not logs-first.
    const entries = [
      ...children.map((child) => ({ at: child.span.startTime, child })),
      ...logs.map((event) => ({ at: event.timestamp, event })),
    ].sort((left, right) => left.at - right.at);

    for (const entry of entries) {
      if ('child' in entry) {
        visit(entry.child, depth + 1);
      } else {
        rows.push({ kind: 'log', span, event: entry.event, depth: depth + 1 });
      }
    }
  }

  for (const root of roots) visit(root, 0);

  return rows;
}
