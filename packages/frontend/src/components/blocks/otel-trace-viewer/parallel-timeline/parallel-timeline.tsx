import { useMemo, useState } from 'react';

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '#components/ui/popover';
import { cn } from '#lib/utils';

import {
  BAR_HEIGHT_PX,
  BAR_MIN_WIDTH_PX,
  GanttHeader,
  ROW_HEIGHT_PX,
} from '../gantt';
import { LOG_DOT_CLASS } from '../log-indicator';
import { logDotColorClass } from '../log-severity';
import { STATUS_BG } from '../status';
import type { OtelSpan, SpanNode, TraceGroup } from '../trace-model';
import {
  collectSpans,
  formatDuration,
  formatSpanName,
  isLog,
  spanDuration,
  spanTimelineBounds,
} from '../trace-model';
import { buildParallelTracks } from './layout';
import { OverlapPicker } from './overlap-picker';

interface ParallelTimelineProps {
  readonly trace: TraceGroup;
  readonly selectedSpanId: string | null;
  readonly focusedSpanId: string | null;
  readonly highlightedOverlapSpanIds: ReadonlySet<string>;
  readonly hoveredOverlapSpanId: string | null;
  readonly onSpanClick: (span: OtelSpan) => void;
  readonly onOverlapClick: (spans: readonly OtelSpan[]) => void;
  readonly onOverlapCancel: () => void;
  readonly onOverlapHover: (span: OtelSpan | null) => void;
  readonly onOverlapSelect: (span: OtelSpan) => void;
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

function collectSubtreeSpanIds(node: SpanNode, spanIds: Set<string>) {
  spanIds.add(node.span.spanId);
  for (const child of node.children) collectSubtreeSpanIds(child, spanIds);
}

export function ParallelTimeline({
  trace,
  selectedSpanId,
  focusedSpanId,
  highlightedOverlapSpanIds,
  hoveredOverlapSpanId,
  onSpanClick,
  onOverlapClick,
  onOverlapCancel,
  onOverlapHover,
  onOverlapSelect,
}: ParallelTimelineProps) {
  const [overlapAnchorSpanId, setOverlapAnchorSpanId] = useState<string | null>(
    null,
  );
  const { traceStart, traceEnd } = useMemo(() => {
    const spans = collectSpans(trace.roots);
    return spanTimelineBounds(spans, trace.startTime);
  }, [trace]);
  const tracks = useMemo(
    () => buildParallelTracks(trace.roots, traceStart, traceEnd),
    [trace.roots, traceStart, traceEnd],
  );
  const focusedClusterKey = useMemo(() => {
    if (!focusedSpanId) return null;
    return (
      tracks
        .flatMap((track) => track.spans)
        .find(({ span }) => span.spanId === focusedSpanId)?.clusterKey ?? null
    );
  }, [focusedSpanId, tracks]);
  const hierarchyFocus = useMemo(() => {
    if (!selectedSpanId) return null;
    const path = findSpanPath(trace.roots, selectedSpanId);
    const selectedNode = path?.at(-1);
    if (!path || !selectedNode) return null;

    const pathSpanIds = new Set(path.map((node) => node.span.spanId));
    const relatedSpanIds = new Set(pathSpanIds);
    collectSubtreeSpanIds(selectedNode, relatedSpanIds);
    return { pathSpanIds, relatedSpanIds };
  }, [selectedSpanId, trace.roots]);
  const overlapFocus = useMemo(() => {
    if (highlightedOverlapSpanIds.size === 0) return null;
    const depth = tracks.find((track) =>
      track.spans.some(({ span }) =>
        highlightedOverlapSpanIds.has(span.spanId),
      ),
    )?.depth;
    if (depth === undefined) return null;

    const ancestorSpanIds = new Set<string>();
    for (const spanId of highlightedOverlapSpanIds) {
      const path = findSpanPath(trace.roots, spanId);
      for (const node of path?.slice(0, -1) ?? []) {
        ancestorSpanIds.add(node.span.spanId);
      }
    }
    return { ancestorSpanIds, depth };
  }, [highlightedOverlapSpanIds, trace.roots, tracks]);
  const total = Math.max(traceEnd - traceStart, 1);

  return (
    <div className="min-w-[560px]">
      <div className="sticky top-0 z-50 border-b border-border bg-popover px-3">
        <GanttHeader traceStart={traceStart} traceEnd={traceEnd} />
      </div>
      <div className="m-3 space-y-2">
        {tracks.map((track) => (
          <div
            className="relative"
            key={track.depth}
            style={{ height: ROW_HEIGHT_PX }}
          >
            {track.spans.map(({ span, clusterKey, startPct, widthPct }) => {
              const cluster = track.clusters.find(
                ({ key }) => key === clusterKey,
              )!;
              const focused = focusedSpanId === span.spanId;
              const focusedCompetitor =
                focusedClusterKey === clusterKey && !focused;
              const hierarchyDimmed =
                hierarchyFocus !== null &&
                !hierarchyFocus.relatedSpanIds.has(span.spanId);
              const overlapContextDimmed =
                overlapFocus !== null &&
                (track.depth > overlapFocus.depth ||
                  (track.depth === overlapFocus.depth
                    ? !highlightedOverlapSpanIds.has(span.spanId)
                    : track.depth < overlapFocus.depth &&
                      !overlapFocus.ancestorSpanIds.has(span.spanId)));
              const hierarchyPathSpan =
                hierarchyFocus?.pathSpanIds.has(span.spanId) ?? false;
              const unresolvedOverlap =
                cluster.laneCount > 1 && !focused && !hierarchyPathSpan;
              const selected = selectedSpanId === span.spanId;
              const overlapHighlighted =
                unresolvedOverlap && highlightedOverlapSpanIds.has(span.spanId);
              const overlapHovered =
                overlapHighlighted && hoveredOverlapSpanId === span.spanId;
              const anotherOverlapHovered =
                overlapHighlighted &&
                hoveredOverlapSpanId !== null &&
                !overlapHovered;
              const opacityClass = selected
                ? 'opacity-100'
                : overlapHovered
                  ? 'opacity-100'
                  : overlapHighlighted
                    ? anotherOverlapHovered
                      ? 'opacity-30'
                      : 'opacity-100'
                    : focusedCompetitor ||
                        hierarchyDimmed ||
                        overlapContextDimmed
                      ? 'opacity-15'
                      : unresolvedOverlap
                        ? 'opacity-55'
                        : 'opacity-90';
              const top = (ROW_HEIGHT_PX - BAR_HEIGHT_PX) / 2;
              const logs = span.events.filter(isLog);
              const overlapSpans = track.spans
                .filter((item) => cluster.spanIds.has(item.span.spanId))
                .map((item) => item.span);

              const barContent = (
                <>
                  <span
                    className={cn(
                      'min-w-0 truncate font-mono text-[9px] font-medium leading-none',
                      unresolvedOverlap && !overlapHovered && 'opacity-0',
                    )}
                  >
                    {formatSpanName(span.name, span.attributes)}
                  </span>
                  <span
                    className={cn(
                      'ml-auto shrink-0 font-mono text-[8px] leading-none opacity-75',
                      unresolvedOverlap && !overlapHovered && 'opacity-0',
                    )}
                  >
                    {formatDuration(spanDuration(span))}
                  </span>
                </>
              );
              const barClassName = cn(
                'absolute flex items-center gap-1 overflow-hidden rounded-sm px-1.5 text-left text-white shadow-sm',
                'transition-[opacity,filter] duration-150 hover:z-30 hover:brightness-110',
                STATUS_BG[span.status],
                span.status === 'running' && 'animate-pulse',
                opacityClass,
                selected
                  ? 'z-30 ring-2 ring-primary'
                  : overlapHovered
                    ? 'z-40 brightness-125 ring-2 ring-foreground'
                    : overlapHighlighted
                      ? 'z-30 ring-2 ring-primary'
                      : 'z-20',
              );
              const barStyle = {
                left: `${(startPct * 100).toFixed(4)}%`,
                top,
                width: `${(widthPct * 100).toFixed(4)}%`,
                minWidth: BAR_MIN_WIDTH_PX,
                height: BAR_HEIGHT_PX,
              };
              const barTitle = unresolvedOverlap
                ? `${overlapSpans.length} overlapping spans`
                : `${formatSpanName(span.name, span.attributes)} · ${formatDuration(spanDuration(span))}`;

              const overlapBar = (
                <PopoverTrigger
                  render={
                    <button
                      aria-current={selected ? 'true' : undefined}
                      className={barClassName}
                      style={barStyle}
                      title={barTitle}
                      type="button"
                    />
                  }
                >
                  {barContent}
                </PopoverTrigger>
              );

              return (
                <div key={span.spanId}>
                  {unresolvedOverlap ? (
                    <Popover
                      open={
                        overlapAnchorSpanId === span.spanId &&
                        highlightedOverlapSpanIds.size > 0
                      }
                      onOpenChange={(open) => {
                        if (open) {
                          setOverlapAnchorSpanId(span.spanId);
                          onOverlapClick(overlapSpans);
                          return;
                        }
                        if (overlapAnchorSpanId === span.spanId) {
                          setOverlapAnchorSpanId(null);
                          onOverlapCancel();
                        }
                      }}
                    >
                      {overlapBar}
                      <PopoverContent
                        align="start"
                        className="w-64 gap-0 p-0"
                        side="bottom"
                        sideOffset={6}
                      >
                        <OverlapPicker
                          spans={overlapSpans}
                          onHover={onOverlapHover}
                          onSelect={(selectedSpan) => {
                            setOverlapAnchorSpanId(null);
                            onOverlapSelect(selectedSpan);
                          }}
                        />
                      </PopoverContent>
                    </Popover>
                  ) : (
                    <button
                      aria-current={selected ? 'true' : undefined}
                      className={barClassName}
                      onClick={() => onSpanClick(span)}
                      style={barStyle}
                      title={barTitle}
                      type="button"
                    >
                      {barContent}
                    </button>
                  )}
                  {logs.map((event, index) => {
                    const eventPct = Math.min(
                      1,
                      Math.max(0, (event.timestamp - traceStart) / total),
                    );
                    return (
                      <span
                        aria-hidden
                        className={cn(
                          'pointer-events-none absolute z-40 -translate-x-1/2 -translate-y-1/2',
                          LOG_DOT_CLASS,
                          logDotColorClass(event),
                          (focusedCompetitor ||
                            hierarchyDimmed ||
                            overlapContextDimmed) &&
                            'opacity-15',
                        )}
                        key={`${event.timestamp}:${event.name}:${index}`}
                        style={{
                          left: `${(eventPct * 100).toFixed(4)}%`,
                          top: top + BAR_HEIGHT_PX / 2,
                        }}
                      />
                    );
                  })}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
