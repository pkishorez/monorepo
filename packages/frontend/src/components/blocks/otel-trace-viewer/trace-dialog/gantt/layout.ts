import type { OtelSpan } from '../../types';
import type { SpanNode } from '../../utils';

export const NAME_COL_WIDTH = 248;
export const ROW_HEIGHT_PX = 32;
export const BAR_HEIGHT_PX = 18;
export const INDENT_PX = 16;
export const BAR_COL_INSET = 10;

export type GanttRow = {
  span: OtelSpan;
  depth: number;
  startPct: number;
  widthPct: number;
};

export function buildGanttRows(
  roots: SpanNode[],
  traceStart: number,
  traceEnd: number,
): GanttRow[] {
  const total = Math.max(traceEnd - traceStart, 1);
  const rows: GanttRow[] = [];

  function visit(node: SpanNode, depth: number) {
    const { span, children } = node;
    const startPct = (span.startTime - traceStart) / total;
    const rawEnd = span.endTime ?? traceEnd;
    const endPct = (rawEnd - traceStart) / total;
    const widthPct = Math.max(endPct - startPct, 0.002);

    rows.push({ span, depth, startPct, widthPct });

    for (const child of children) visit(child, depth + 1);
  }

  for (const root of roots) visit(root, 0);

  return rows;
}
