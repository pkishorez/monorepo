import { Fragment, useCallback, useMemo, useRef, useState } from 'react';

import type { OtelEvent, OtelSpan, SpanNode } from '../trace-model';
import { collectSpans, isLog, type TraceGroup } from '../trace-model';
import { useElementWidth } from '../use-element-width';
import { GanttHeader } from './gantt-header';
import { GanttLogRow } from './gantt-log-row';
import { GanttRow } from './gantt-row';

function findNode(nodes: SpanNode[], spanId: string): SpanNode | null {
  for (const node of nodes) {
    if (node.span.spanId === spanId) return node;
    const found = findNode(node.children, spanId);
    if (found) return found;
  }
  return null;
}
import {
  BAR_COL_INSET,
  BAR_MIN_WIDTH_PX,
  buildGanttRows,
  MAX_NAME_COL_WIDTH,
  MIN_NAME_COL_WIDTH,
  NAME_COL_WIDTH,
} from './layout';

interface GanttProps {
  trace: TraceGroup;
  selectedSpanId: string | null;
  selectedLog: OtelEvent | null;
  onSpanClick: (span: OtelSpan) => void;
  onLogClick: (span: OtelSpan, event: OtelEvent) => void;
  showLogs?: boolean;
  nameColWidth?: number;
  onNameColWidthChange?: (next: number) => void;
}

export function Gantt({
  trace,
  selectedSpanId,
  selectedLog,
  onSpanClick,
  onLogClick,
  showLogs = false,
  nameColWidth = NAME_COL_WIDTH,
  onNameColWidthChange,
}: GanttProps) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  // Double-click / "first level" toggles just the clicked span — collapse hides
  // its direct children, expand shows them.
  const toggleCollapse = useCallback((spanId: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(spanId)) next.delete(spanId);
      else next.add(spanId);
      return next;
    });
  }, []);

  // Expand a span by a single level: reveal its direct children but keep every
  // child that has children of its own collapsed.
  const expandFirstLevel = useCallback(
    (spanId: string) => {
      const node = findNode(trace.roots, spanId);
      if (!node) return;
      setCollapsed((prev) => {
        const next = new Set(prev);
        next.delete(spanId);
        for (const child of node.children) {
          if (child.children.length > 0) next.add(child.span.spanId);
        }
        return next;
      });
    },
    [trace.roots],
  );

  // Recursively expand a span and every descendant back open.
  const expandSubtree = useCallback(
    (spanId: string) => {
      const node = findNode(trace.roots, spanId);
      if (!node) return;
      const ids: string[] = [];
      const walk = (n: SpanNode) => {
        ids.push(n.span.spanId);
        n.children.forEach(walk);
      };
      walk(node);
      setCollapsed((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.delete(id);
        return next;
      });
    },
    [trace.roots],
  );

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
    () => buildGanttRows(trace.roots, traceStart, traceEnd, collapsed),
    [trace.roots, traceStart, traceEnd, collapsed],
  );

  // Pixel width of the bar column (minus its inset margins) lets each row tell
  // whether its bar is being held open by the pixel minimum.
  const [barColRef, barColWidth] = useElementWidth<HTMLDivElement>();
  const barAreaPx = Math.max(0, barColWidth - BAR_COL_INSET * 2);
  const minWidthPct = barAreaPx > 0 ? BAR_MIN_WIDTH_PX / barAreaPx : 0;

  return (
    <div className="flex flex-col">
      {/* Sticky header — name col placeholder + time axis */}
      <div className="sticky top-0 z-10 flex shrink-0 items-stretch border-b border-border bg-popover">
        <div
          className="relative flex shrink-0 items-center border-r border-border/30 px-3 py-2"
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
        <div ref={barColRef} className="flex-1">
          <GanttHeader traceStart={traceStart} traceEnd={traceEnd} />
        </div>
      </div>

      {/* Span rows */}
      {rows.map((row) => (
        <Fragment key={row.span.spanId}>
          <GanttRow
            row={row}
            selected={
              selectedLog === null && selectedSpanId === row.span.spanId
            }
            minWidthPct={minWidthPct}
            onClick={() => onSpanClick(row.span)}
            onToggleCollapse={() => toggleCollapse(row.span.spanId)}
            onExpandFirstLevel={() => expandFirstLevel(row.span.spanId)}
            onExpandSubtree={() => expandSubtree(row.span.spanId)}
            nameColWidth={nameColWidth}
            showLogs={showLogs}
          />
          {showLogs &&
            row.span.events
              .filter(isLog)
              .sort((a, b) => a.timestamp - b.timestamp)
              .map((event, index) => (
                <GanttLogRow
                  key={`${event.timestamp}:${event.name}:${index}`}
                  event={event}
                  depth={row.depth}
                  selected={selectedLog === event}
                  traceStart={traceStart}
                  traceEnd={traceEnd}
                  nameColWidth={nameColWidth}
                  onClick={() => onLogClick(row.span, event)}
                />
              ))}
        </Fragment>
      ))}
    </div>
  );
}
