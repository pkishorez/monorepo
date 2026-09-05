import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
} from 'react';
import { FocusIcon, MessageSquareTextIcon } from 'lucide-react';

import { Button } from '#components/ui/button';
import { cn } from '#lib/utils';

import type { OtelEvent, OtelSpan, SpanNode } from '../trace-model';
import {
  collectSpans,
  spanTimelineBounds,
  type TraceGroup,
} from '../trace-model';
import { useElementWidth } from '#hooks/use-element-width';
import { GanttHeader as GanttHeaderView } from './gantt-header';
import { GanttLogRow } from './gantt-log-row';
import { GanttRow } from './gantt-row';
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
  onSpanClick: (span: OtelSpan) => void;
  focusPath?: boolean;
  onFocusPathChange?: (focusPath: boolean) => void;
  nameColWidth?: number;
  onNameColWidthChange?: (next: number) => void;
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
  focusPath = false,
  onFocusPathChange,
  nameColWidth = NAME_COL_WIDTH,
  onNameColWidthChange,
  selectedLog = null,
  hoveredLog = null,
  onLogClick,
  onLogHover,
}: GanttProps) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [showLogs, setShowLogs] = useState(true);

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

  const toggleImmediateChildren = useCallback(
    (spanId: string) => {
      const path = findSpanPath(trace.roots, spanId);
      const node = path?.at(-1);
      if (!path || !node || node.children.length === 0) return;
      const isRoot = path.length === 1;

      setCollapsed((current) => {
        const next = new Set(current);
        if (!isRoot && !current.has(spanId)) {
          next.add(spanId);
          return next;
        }
        // Reveal immediate children with their own branches collapsed. Roots
        // are never collapsed themselves, so their toggle flips the branches.
        const branches = node.children.filter(
          (child) => child.children.length > 0,
        );
        const collapseBranches =
          !isRoot || branches.some((child) => !current.has(child.span.spanId));
        next.delete(spanId);
        for (const child of branches) {
          if (collapseBranches) next.add(child.span.spanId);
          else next.delete(child.span.spanId);
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
    () =>
      buildGanttRows(trace.roots, traceStart, traceEnd, collapsed, showLogs),
    [trace.roots, traceStart, traceEnd, collapsed, showLogs],
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
          <Button
            aria-label={showLogs ? 'Hide logs' : 'Show logs'}
            aria-pressed={showLogs}
            className={cn(
              'ml-1 text-muted-foreground',
              showLogs && 'bg-muted text-foreground',
            )}
            onClick={() => setShowLogs((current) => !current)}
            size="icon-xs"
            title={showLogs ? 'Hide logs' : 'Show logs'}
            type="button"
            variant="ghost"
          >
            <MessageSquareTextIcon />
          </Button>
          {onNameColWidthChange && (
            <div
              className="absolute inset-y-0 right-0 z-20 w-1 translate-x-1/2 cursor-col-resize bg-transparent transition-colors hover:bg-primary/20"
              onMouseDown={onDividerMouseDown}
            />
          )}
        </div>
        <div ref={barColRef} className="flex-1">
          <GanttHeaderView traceStart={traceStart} traceEnd={traceEnd} />
        </div>
      </div>

      {rows.map((row, index) =>
        row.kind === 'span' ? (
          <GanttRow
            key={row.span.spanId}
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
            onToggleChildren={() => toggleImmediateChildren(row.span.spanId)}
            logsVisible={showLogs}
            nameColWidth={nameColWidth}
            selectedLog={selectedLog}
            hoveredLog={hoveredLog}
          />
        ) : (
          <GanttLogRow
            key={`${row.span.spanId}:log:${row.event.timestamp}:${row.event.name}:${index}`}
            event={row.event}
            span={row.span}
            depth={row.depth}
            dimmed={
              highlightedSpanIds !== null &&
              !highlightedSpanIds.has(row.span.spanId)
            }
            nameColWidth={nameColWidth}
            onClick={() => onLogClick?.(row.span, row.event)}
            onHoverChange={(hovered) =>
              onLogHover?.(hovered ? row.event : null)
            }
            selected={selectedLog === row.event}
          />
        ),
      )}
    </div>
  );
}

export function GanttHeader(props: ComponentProps<typeof GanttHeaderView>) {
  return <GanttHeaderView {...props} />;
}

export {
  BAR_COL_INSET,
  BAR_HEIGHT_PX,
  BAR_MIN_WIDTH_PX,
  ROW_HEIGHT_PX,
} from './layout';
