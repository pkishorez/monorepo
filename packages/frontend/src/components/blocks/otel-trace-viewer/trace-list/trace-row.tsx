import { cn } from '#lib/utils';

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '#components/ui/tooltip';
import { STATUS_BG, StatusDot } from '../status';
import {
  BAR_COL_INSET,
  BAR_HEIGHT_PX,
  BAR_MIN_WIDTH_PX,
} from '../gantt/layout';
import type { TraceGroup } from '../trace-model';
import { formatDuration } from '../trace-model';

/**
 * Trace-list columns are identified by a stable `key` so their widths can be
 * persisted by name and shared across every trace-list view. The trailing
 * timeline column is fluid (`flex-1`) and therefore not part of this config.
 */
export type TraceColumnKey = 'name' | 'time' | 'spans';

export interface TraceColumn {
  key: TraceColumnKey;
  label: string;
  defaultWidth: number;
  min: number;
  max: number;
  align?: 'start' | 'end';
}

export const TRACE_COLUMNS: readonly TraceColumn[] = [
  { key: 'name', label: 'Name', defaultWidth: 200, min: 120, max: 640 },
  { key: 'time', label: 'Time', defaultWidth: 84, min: 64, max: 200 },
  {
    key: 'spans',
    label: 'Spans',
    defaultWidth: 56,
    min: 44,
    max: 200,
    align: 'end',
  },
];

/**
 * A compact, human-readable "time ago" for a trace's start relative to `now`
 * (both epoch ms). Recent traces read as seconds/minutes; older ones fall back
 * to the wall-clock time.
 */
export function formatRelativeTime(startMs: number, now: number): string {
  const diff = Math.max(0, now - startMs);
  const secs = Math.floor(diff / 1000);
  if (secs < 5) return 'just now';
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(startMs).toLocaleDateString();
}

export type TraceColumnWidths = Record<TraceColumnKey, number>;

export function resolveColumnWidths(
  widths: Partial<Record<string, number>> | undefined,
): TraceColumnWidths {
  const out = {} as TraceColumnWidths;
  for (const col of TRACE_COLUMNS) {
    const raw = widths?.[col.key] ?? col.defaultWidth;
    out[col.key] = Math.min(col.max, Math.max(col.min, raw));
  }
  return out;
}

interface TraceRowProps {
  trace: TraceGroup;
  globalStart: number | null;
  globalEnd: number | null;
  now: number;
  widths: TraceColumnWidths;
  minWidthPct?: number;
  isSelected?: boolean;
  onSelect: () => void;
}

export function TraceRow({
  trace,
  globalStart,
  globalEnd,
  now,
  widths,
  minWidthPct = 0,
  isSelected,
  onSelect,
}: TraceRowProps) {
  const effectiveEnd = trace.endTime ?? now;
  const hasBar = globalStart !== null && globalEnd !== null;

  let startPct = 0;
  let widthPct = 0;

  if (hasBar) {
    const total = Math.max(globalEnd - globalStart, 1);
    startPct = (trace.startTime - globalStart) / total;
    const endPct = (effectiveEnd - globalStart) / total;
    widthPct = Math.max(endPct - startPct, 0.002);
  }

  const isRunning = trace.endTime === null;
  const atMinWidth = minWidthPct > 0 && widthPct < minWidthPct;
  // Keep a min-width bar fully inside the column: if placing it at its true
  // start would overflow the right edge (and get clipped to a sliver), pin it
  // so its whole minimum width stays visible.
  const effWidthPct = Math.max(widthPct, minWidthPct);
  const leftPct =
    minWidthPct > 0
      ? Math.min(startPct, Math.max(0, 1 - effWidthPct))
      : startPct;

  return (
    <button
      onClick={onSelect}
      className={cn(
        'group flex w-full items-stretch text-left',
        'transition-colors hover:bg-muted/50 active:bg-muted/70',
        isSelected && 'bg-muted/70',
        trace.missingRoot && 'opacity-50',
      )}
    >
      <div
        className="flex shrink-0 items-center gap-2 overflow-hidden border-r border-border/30 px-3 py-2.5"
        style={{ width: `${widths.name}px` }}
      >
        <StatusDot status={trace.status} />
        <span
          className="min-w-0 flex-1 truncate font-mono text-xs font-medium"
          title={trace.name}
        >
          {trace.name}
        </span>
        {trace.missingRoot && (
          <span className="shrink-0 text-[10px] text-destructive">no root</span>
        )}
      </div>

      <div
        className="flex shrink-0 items-center overflow-hidden border-r border-border/30 px-3"
        style={{ width: `${widths.time}px` }}
      >
        <span
          className="truncate text-[10px] tabular-nums text-muted-foreground"
          title={new Date(trace.startTime).toLocaleString()}
        >
          {formatRelativeTime(trace.startTime, now)}
        </span>
      </div>

      <div
        className="flex shrink-0 items-center justify-end border-r border-border/30 px-3"
        style={{ width: `${widths.spans}px` }}
      >
        <span className="tabular-nums text-[10px] text-muted-foreground">
          {trace.spanCount}
        </span>
      </div>

      <div
        className="flex-1 overflow-hidden"
        style={{
          position: 'relative',
          marginLeft: BAR_COL_INSET,
          marginRight: BAR_COL_INSET,
        }}
      >
        {hasBar && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger
                render={
                  <div
                    className={cn(
                      'absolute top-1/2 -translate-y-1/2 rounded-sm',
                      STATUS_BG[trace.status],
                      isRunning && 'animate-pulse',
                    )}
                    style={{
                      left: `${(leftPct * 100).toFixed(4)}%`,
                      width: `${(widthPct * 100).toFixed(4)}%`,
                      minWidth: `${BAR_MIN_WIDTH_PX}px`,
                      height: `${BAR_HEIGHT_PX}px`,
                      opacity: atMinWidth ? 0.6 : undefined,
                    }}
                  />
                }
              />
              <TooltipContent side="top">
                <div className="flex flex-col gap-0.5 tabular-nums">
                  <div className="flex justify-between gap-4">
                    <span className="text-background/60">Start</span>
                    <span>
                      +{formatDuration(trace.startTime - globalStart)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-background/60">End</span>
                    {isRunning ? (
                      <span className="text-amber-400">in progress</span>
                    ) : (
                      <span>
                        +{formatDuration(trace.endTime! - globalStart)}
                      </span>
                    )}
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-background/60">Duration</span>
                    <span>
                      {formatDuration(effectiveEnd - trace.startTime)}
                    </span>
                  </div>
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
    </button>
  );
}
