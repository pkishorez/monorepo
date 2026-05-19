import { useMemo } from 'react';

import type { OtelSpan } from '../../types';
import { collectSpans, type TraceGroup } from '../../utils';
import { GanttHeader } from './gantt-header';
import { GanttRow } from './gantt-row';
import { buildGanttRows, NAME_COL_WIDTH } from './layout';

interface GanttProps {
  trace: TraceGroup;
  selectedSpanId: string | null;
  onSpanClick: (span: OtelSpan) => void;
}

export function Gantt({ trace, selectedSpanId, onSpanClick }: GanttProps) {
  const { traceStart, traceEnd } = useMemo(() => {
    const allSpans = collectSpans(trace.roots);
    const starts = allSpans.map((s) => s.startTime);
    const ends = allSpans
      .map((s) => s.endTime)
      .filter((e): e is number => e !== null);
    const minStart = starts.length > 0 ? Math.min(...starts) : trace.startTime;
    const maxEnd =
      ends.length > 0 ? Math.max(...ends) : (trace.endTime ?? minStart + 1);
    return { traceStart: minStart, traceEnd: maxEnd };
  }, [trace]);

  const rows = useMemo(
    () => buildGanttRows(trace.roots, traceStart, traceEnd),
    [trace.roots, traceStart, traceEnd],
  );

  return (
    <div className="flex flex-col">
      {/* Sticky header — name col placeholder + time axis */}
      <div className="sticky top-0 z-10 flex shrink-0 items-stretch border-b border-border bg-popover">
        <div
          className="shrink-0 border-r border-border/30 px-3 py-2"
          style={{ width: `${NAME_COL_WIDTH}px` }}
        >
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
            Span
          </span>
        </div>
        <div className="flex-1">
          <GanttHeader traceStart={traceStart} traceEnd={traceEnd} />
        </div>
      </div>

      {/* Span rows */}
      {rows.map((row) => (
        <GanttRow
          key={row.span.spanId}
          row={row}
          selected={selectedSpanId === row.span.spanId}
          onClick={() => onSpanClick(row.span)}
        />
      ))}
    </div>
  );
}
