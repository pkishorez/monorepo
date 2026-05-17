import { useEffect, useMemo, useState } from 'react';

import { SearchIcon } from 'lucide-react';

import { Button } from '#components/ui/button';
import { Kbd } from '#components/ui/kbd';

import { GanttHeader } from '../trace-dialog/gantt/gantt-header';
import type { TraceGroup } from '../utils';
import {
  LIST_NAME_COL_WIDTH,
  LIST_SERVICE_COL_WIDTH,
  LIST_SPANS_COL_WIDTH,
  TraceRow,
} from './trace-row';

interface TraceListProps {
  traces: TraceGroup[];
  selectedTraceId?: string | null;
  showHeader?: boolean;
  onSelectTrace: (trace: TraceGroup) => void;
  onOpenSearch?: () => void;
}

export function TraceList({
  traces,
  selectedTraceId,
  showHeader = true,
  onSelectTrace,
  onOpenSearch,
}: TraceListProps) {
  const hasRunning = useMemo(
    () => traces.some((t) => t.endTime === null),
    [traces],
  );

  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!hasRunning) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [hasRunning]);

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
            <div
              className="shrink-0 border-r border-border/30 px-3 py-1.5"
              style={{ width: `${LIST_NAME_COL_WIDTH}px` }}
            >
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Name
              </span>
            </div>
            <div
              className="flex shrink-0 items-center border-r border-border/30 px-3"
              style={{ width: `${LIST_SERVICE_COL_WIDTH}px` }}
            >
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Service
              </span>
            </div>
            <div
              className="flex shrink-0 items-center justify-end border-r border-border/30 px-3"
              style={{ width: `${LIST_SPANS_COL_WIDTH}px` }}
            >
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Spans
              </span>
            </div>
            <div className="flex-1">
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
