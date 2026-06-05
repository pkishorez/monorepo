import { useCallback, useMemo, useRef } from 'react';

import type { OtelSpan } from '../trace-model';
import { collectSpans, type TraceGroup } from '../trace-model';
import { GanttHeader } from './gantt-header';
import { GanttRow } from './gantt-row';
import {
  buildGanttRows,
  MAX_NAME_COL_WIDTH,
  MIN_NAME_COL_WIDTH,
  NAME_COL_WIDTH,
} from './layout';

interface GanttProps {
  trace: TraceGroup;
  selectedSpanId: string | null;
  onSpanClick: (span: OtelSpan) => void;
  nameColWidth?: number;
  onNameColWidthChange?: (next: number) => void;
}

export function Gantt({
  trace,
  selectedSpanId,
  onSpanClick,
  nameColWidth = NAME_COL_WIDTH,
  onNameColWidthChange,
}: GanttProps) {
  const widthRef = useRef(nameColWidth);
  widthRef.current = nameColWidth;

  const onDividerMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!onNameColWidthChange) return;
      e.preventDefault();
      const startX = e.clientX;
      const startW = widthRef.current;

      function onMouseMove(ev: MouseEvent) {
        const next = Math.min(
          MAX_NAME_COL_WIDTH,
          Math.max(MIN_NAME_COL_WIDTH, startW + ev.clientX - startX),
        );
        widthRef.current = next;
        onNameColWidthChange?.(next);
      }

      function onMouseUp() {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      }

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    },
    [onNameColWidthChange],
  );

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
          className="relative shrink-0 border-r border-border/30 px-3 py-2"
          style={{ width: `${nameColWidth}px` }}
        >
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
            Span
          </span>
          {onNameColWidthChange && (
            <div
              className="absolute inset-y-0 right-0 z-20 w-1 translate-x-1/2 cursor-col-resize bg-transparent transition-colors hover:bg-primary/20"
              onMouseDown={onDividerMouseDown}
            />
          )}
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
          nameColWidth={nameColWidth}
        />
      ))}
    </div>
  );
}
