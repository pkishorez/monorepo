import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ArrowUpIcon, SearchIcon } from 'lucide-react';

import { Button } from '#components/ui/button';
import { Kbd } from '#components/ui/kbd';

import { GanttHeader } from '../gantt/gantt-header';
import { BAR_COL_INSET, BAR_MIN_WIDTH_PX } from '../gantt/layout';
import { useElementWidth } from '../use-element-width';
import type { TraceGroup } from '../trace-model';
import {
  type TraceColumn,
  type TraceColumnKey,
  TRACE_COLUMNS,
  TraceRow,
  resolveColumnWidths,
} from './trace-row';

interface TraceListProps {
  traces: TraceGroup[];
  selectedTraceId?: string | null;
  showHeader?: boolean;
  columnWidths?: Partial<Record<string, number>>;
  onColumnWidthChange?: (key: TraceColumnKey, width: number) => void;
  onSelectTrace: (trace: TraceGroup) => void;
  onOpenSearch?: () => void;
  /** Count of newer traces held behind the freeze line, shown as a top row. */
  newCount?: number;
  onRevealNew?: () => void;
}

/**
 * Full-width table row announcing buffered newer traces. Lives inside the
 * table (under the header) so revealing them never shifts surrounding layout.
 */
export function NewTracesRow({
  count,
  onClick,
}: {
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-center gap-1.5 border-b border-border/50 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
    >
      <ArrowUpIcon className="size-3" />
      {count} new trace{count !== 1 ? 's' : ''} available
    </button>
  );
}

function ColumnResizeHandle({
  column,
  width,
  onResize,
}: {
  column: TraceColumn;
  width: number;
  onResize: (key: TraceColumnKey, width: number) => void;
}) {
  const widthRef = useRef(width);
  widthRef.current = width;

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startW = widthRef.current;

      function onMouseMove(ev: MouseEvent) {
        const next = Math.min(
          column.max,
          Math.max(column.min, startW + ev.clientX - startX),
        );
        onResize(column.key, next);
      }

      function onMouseUp() {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      }

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    },
    [column, onResize],
  );

  return (
    <div
      className="absolute inset-y-0 right-0 z-20 w-1 translate-x-1/2 cursor-col-resize bg-transparent transition-colors hover:bg-primary/20"
      onMouseDown={onMouseDown}
    />
  );
}

export function TraceList({
  traces,
  selectedTraceId,
  showHeader = true,
  columnWidths,
  onColumnWidthChange,
  onSelectTrace,
  onOpenSearch,
  newCount = 0,
  onRevealNew,
}: TraceListProps) {
  const widths = useMemo(
    () => resolveColumnWidths(columnWidths),
    [columnWidths],
  );
  const hasRunning = useMemo(
    () => traces.some((t) => t.endTime === null),
    [traces],
  );

  const [barColRef, barColWidth] = useElementWidth<HTMLDivElement>();
  const barAreaPx = Math.max(0, barColWidth - BAR_COL_INSET * 2);
  const minWidthPct = barAreaPx > 0 ? BAR_MIN_WIDTH_PX / barAreaPx : 0;

  const [now, setNow] = useState(() => Date.now());

  // Tick every second so the relative "time ago" column stays current (and the
  // running-bar animates). Cheap enough for a devtools list.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const { globalStart, globalEnd } = useMemo(() => {
    if (traces.length === 0) return { globalStart: null, globalEnd: null };

    const allStarts = traces.map((t) => t.startTime);
    const completedEnds = traces
      .filter((t) => t.endTime !== null)
      .map((t) => t.endTime as number);

    const start = Math.min(...allStarts);
    const maxCompleted =
      completedEnds.length > 0 ? Math.max(...completedEnds) : null;
    const end = hasRunning ? Math.max(maxCompleted ?? now, now) : maxCompleted;

    if (end === null) return { globalStart: null, globalEnd: null };

    return { globalStart: start, globalEnd: end };
  }, [traces, hasRunning, now]);

  return (
    <div className="flex flex-col gap-3">
      {showHeader && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {traces.length} trace{traces.length !== 1 ? 's' : ''}
          </span>
          <Button
            variant="outline"
            size="xs"
            onClick={onOpenSearch}
            className="gap-1.5"
          >
            <SearchIcon className="size-3" />
            Search
            <Kbd>⌘K</Kbd>
          </Button>
        </div>
      )}

      {traces.length === 0 ? (
        <div className="flex items-center justify-center rounded-lg border border-border p-10 text-sm text-muted-foreground">
          No traces
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <div className="flex items-stretch border-b border-border bg-muted/30">
            {TRACE_COLUMNS.map((col) => (
              <div
                key={col.key}
                className="relative flex shrink-0 items-center border-r border-border/30 px-3 py-1.5"
                style={{
                  width: `${widths[col.key]}px`,
                  justifyContent: col.align === 'end' ? 'flex-end' : undefined,
                }}
              >
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {col.label}
                </span>
                {onColumnWidthChange && (
                  <ColumnResizeHandle
                    column={col}
                    width={widths[col.key]}
                    onResize={onColumnWidthChange}
                  />
                )}
              </div>
            ))}
            <div ref={barColRef} className="flex-1">
              {globalStart !== null && globalEnd !== null ? (
                <GanttHeader
                  traceStart={globalStart}
                  traceEnd={globalEnd}
                  tickCount={4}
                />
              ) : (
                <div className="h-8" />
              )}
            </div>
          </div>
          {newCount > 0 && onRevealNew && (
            <NewTracesRow count={newCount} onClick={onRevealNew} />
          )}
          {traces.map((trace, i) => (
            <div
              key={trace.traceId}
              className={
                i < traces.length - 1 ? 'border-b border-border/50' : ''
              }
            >
              <TraceRow
                trace={trace}
                globalStart={globalStart}
                globalEnd={globalEnd}
                now={now}
                widths={widths}
                minWidthPct={minWidthPct}
                isSelected={selectedTraceId === trace.traceId}
                onSelect={() => onSelectTrace(trace)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
