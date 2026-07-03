import type { OtelSpan } from '../trace-model';
import type { SpanNode } from '../trace-model';

export const NAME_COL_WIDTH = 248;
export const MIN_NAME_COL_WIDTH = 140;
export const MAX_NAME_COL_WIDTH = 640;
export const ROW_HEIGHT_PX = 32;
export const BAR_HEIGHT_PX = 18;
/** Minimum rendered width of a span bar so short spans stay visible/clickable. */
export const BAR_MIN_WIDTH_PX = 6;
export const INDENT_PX = 16;
export const BAR_COL_INSET = 10;

export type GanttRow = {
  span: OtelSpan;
  depth: number;
  startPct: number;
  widthPct: number;
  hasChildren: boolean;
  collapsed: boolean;
  /** Number of descendant spans hidden while this row is collapsed. */
  hiddenCount: number;
};

function countDescendants(node: SpanNode): number {
  let total = 0;
  for (const child of node.children) total += 1 + countDescendants(child);
  return total;
}

export function buildGanttRows(
  roots: SpanNode[],
  traceStart: number,
  traceEnd: number,
  collapsed?: ReadonlySet<string>,
): GanttRow[] {
  const total = Math.max(traceEnd - traceStart, 1);
  const rows: GanttRow[] = [];

  function visit(node: SpanNode, depth: number) {
    const { span, children } = node;
    const startPct = (span.startTime - traceStart) / total;
    const rawEnd = span.endTime ?? traceEnd;
    const endPct = (rawEnd - traceStart) / total;
    const widthPct = Math.max(endPct - startPct, 0.002);
    const isCollapsed = collapsed?.has(span.spanId) ?? false;

    rows.push({
      span,
      depth,
      startPct,
      widthPct,
      hasChildren: children.length > 0,
      collapsed: isCollapsed,
      hiddenCount: isCollapsed ? countDescendants(node) : 0,
    });

    if (!isCollapsed) for (const child of children) visit(child, depth + 1);
  }

  for (const root of roots) visit(root, 0);

  return rows;
}
