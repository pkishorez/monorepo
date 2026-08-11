import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FocusIcon } from 'lucide-react';

import { Button } from '#components/ui/button';
import { AnimatePresence, motion } from '#lib/motion';
import { cn } from '#lib/utils';

import type { OtelEvent, OtelSpan, SpanNode } from '../trace-model';
import {
  collectSpans,
  spanTimelineBounds,
  type TraceGroup,
} from '../trace-model';
import { useElementWidth } from '../use-element-width';
import { GanttHeader } from './gantt-header';
import { GanttRow } from './gantt-row';
import {
  BAR_COL_INSET,
  BAR_MIN_WIDTH_PX,
  buildGanttRows,
  defaultCollapsedSpanIds,
  MAX_NAME_COL_WIDTH,
  MIN_NAME_COL_WIDTH,
  NAME_COL_WIDTH,
} from './layout';

interface GanttProps {
  trace: TraceGroup;
  selectedSpanId: string | null;
  onSpanClick: (span: OtelSpan) => void;
  focusPath?: boolean;
  onFocusPathChange?: (focusPath: boolean) => void;
  nameColWidth?: number;
  onNameColWidthChange?: (next: number) => void;
  inlineLogSpanIds?: ReadonlySet<string>;
  onToggleInlineLogs?: (span: OtelSpan) => void;
  selectedLog?: OtelEvent | null;
  hoveredLog?: OtelEvent | null;
  onLogClick?: (span: OtelSpan, event: OtelEvent) => void;
  onLogHover?: (event: OtelEvent | null) => void;
}

function findSpanPath(
  nodes: readonly SpanNode[],
  spanId: string,
  path: readonly SpanNode[] = [],
): readonly SpanNode[] | null {
  for (const node of nodes) {
    const nextPath = [...path, node];
    if (node.span.spanId === spanId) return nextPath;
    const found = findSpanPath(node.children, spanId, nextPath);
    if (found) return found;
  }
  return null;
}

function collectCollapsibleDescendantIds(node: SpanNode, spanIds: Set<string>) {
  for (const child of node.children) {
    if (child.children.length > 0) spanIds.add(child.span.spanId);
    collectCollapsibleDescendantIds(child, spanIds);
  }
}

export function Gantt({
  trace,
  selectedSpanId,
  onSpanClick,
  focusPath = true,
  onFocusPathChange,
  nameColWidth = NAME_COL_WIDTH,
  onNameColWidthChange,
  inlineLogSpanIds = new Set(),
  onToggleInlineLogs,
  selectedLog = null,
  hoveredLog = null,
  onLogClick,
  onLogHover,
}: GanttProps) {
  // Running traces can discover deeper spans after the waterfall mounts. Add
  // only newly discovered branches to the collapsed defaults so a user's
  // explicit expand/collapse choices remain untouched.
  const collapsibleIds = useMemo(
    () => defaultCollapsedSpanIds(trace.roots),
    [trace.roots],
  );
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(
    () => collapsibleIds,
  );
  const knownCollapsibleIds = useRef(collapsibleIds);

  useEffect(() => {
    const newlyDiscovered = [...collapsibleIds].filter(
      (spanId) => !knownCollapsibleIds.current.has(spanId),
    );
    knownCollapsibleIds.current = collapsibleIds;
    if (newlyDiscovered.length === 0) return;
    setCollapsed((current) => new Set([...current, ...newlyDiscovered]));
  }, [collapsibleIds]);

  const toggleCollapse = useCallback((spanId: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(spanId)) next.delete(spanId);
      else next.add(spanId);
      return next;
    });
  }, []);

  const toggleRootDescendants = useCallback(
    (spanId: string) => {
      const root = trace.roots.find((node) => node.span.spanId === spanId);
      if (!root) return;

      const descendantIds = new Set<string>();
      collectCollapsibleDescendantIds(root, descendantIds);
      if (descendantIds.size === 0) return;

      setCollapsed((current) => {
        const next = new Set(current);
        const collapseAll = [...descendantIds].some(
          (descendantId) => !current.has(descendantId),
        );
        for (const descendantId of descendantIds) {
          if (collapseAll) next.add(descendantId);
          else next.delete(descendantId);
        }
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
    return spanTimelineBounds(allSpans, trace.startTime);
  }, [trace]);

  const rows = useMemo(
    () => buildGanttRows(trace.roots, traceStart, traceEnd, collapsed),
    [trace.roots, traceStart, traceEnd, collapsed],
  );
  const highlightedSpanIds = useMemo(() => {
    if (!focusPath || !selectedSpanId) return null;
    const path = findSpanPath(trace.roots, selectedSpanId);
    const selectedNode = path?.at(-1);
    if (!path || !selectedNode) return null;

    return new Set([
      ...path.map((node) => node.span.spanId),
      ...selectedNode.children.map((node) => node.span.spanId),
    ]);
  }, [focusPath, selectedSpanId, trace.roots]);

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
          <Button
            aria-label="Focus selected span path"
            aria-pressed={focusPath}
            className={cn(
              'text-muted-foreground',
              focusPath && 'bg-muted text-foreground',
            )}
            onClick={() => onFocusPathChange?.(!focusPath)}
            size="icon-xs"
            title={
              focusPath
                ? 'Show all spans normally'
                : 'Focus selected path and direct children'
            }
            type="button"
            variant="ghost"
          >
            <FocusIcon />
          </Button>
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

      <AnimatePresence initial={false} mode="popLayout">
        {rows.map((row) => (
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            initial={{ opacity: 0, y: -4 }}
            key={row.span.spanId}
            layout="position"
            transition={{ duration: 0.18, ease: 'easeOut' }}
          >
            <GanttRow
              row={row}
              selected={selectedSpanId === row.span.spanId}
              dimmed={
                highlightedSpanIds !== null &&
                !highlightedSpanIds.has(row.span.spanId)
              }
              minWidthPct={minWidthPct}
              onClick={() => {
                if (selectedSpanId === row.span.spanId && row.hasChildren) {
                  if (row.depth === 0) toggleRootDescendants(row.span.spanId);
                  else toggleCollapse(row.span.spanId);
                }
                onSpanClick(row.span);
              }}
              onToggleInlineLogs={() => onToggleInlineLogs?.(row.span)}
              nameColWidth={nameColWidth}
              showLogs={inlineLogSpanIds.has(row.span.spanId)}
              selectedLog={selectedLog}
              hoveredLog={hoveredLog}
              onLogClick={(event) => onLogClick?.(row.span, event)}
              onLogHover={onLogHover}
            />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
