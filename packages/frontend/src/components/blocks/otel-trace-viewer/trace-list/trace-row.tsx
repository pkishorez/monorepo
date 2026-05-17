import { cn } from '#lib/utils';

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '#components/ui/tooltip';
import { STATUS_BG, StatusDot } from '../status';
import { BAR_COL_INSET, BAR_HEIGHT_PX } from '../trace-dialog/gantt/layout';
import type { TraceGroup } from '../utils';
import { formatDuration } from '../utils';

export const LIST_NAME_COL_WIDTH = 200;
export const LIST_SERVICE_COL_WIDTH = 140;
export const LIST_SPANS_COL_WIDTH = 56;

interface TraceRowProps {
  trace: TraceGroup;
  globalStart: number | null;
  globalEnd: number | null;
  now: number;
  isSelected?: boolean;
  onSelect: () => void;
}

export function TraceRow({
  trace,
  globalStart,
  globalEnd,
  now,
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
        style={{ width: `${LIST_NAME_COL_WIDTH}px` }}
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
        style={{ width: `${LIST_SERVICE_COL_WIDTH}px` }}
      >
        <span
          className="truncate font-mono text-[10px] text-muted-foreground"
          title={trace.serviceName ?? undefined}
        >
          {trace.serviceName ?? '—'}
        </span>
      </div>

      <div
        className="flex shrink-0 items-center justify-end border-r border-border/30 px-3"
        style={{ width: `${LIST_SPANS_COL_WIDTH}px` }}
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
                      left: `${(startPct * 100).toFixed(4)}%`,
                      width: `${(widthPct * 100).toFixed(4)}%`,
                      minWidth: '4px',
                      height: `${BAR_HEIGHT_PX}px`,
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
