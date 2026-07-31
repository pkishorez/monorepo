import { ChevronDown, Maximize2, Minimize2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '#components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '#components/ui/dropdown-menu';
import { Switch } from '#components/ui/switch';
import { scrollbarStyles } from '#lib/scrollStyles';
import { cn } from '#lib/utils';

import { StatusDot } from '../status';
import { TraceDock, type TraceDockSettings } from '../trace-dock';
import type { OtelSpan } from '../trace-model';
import { formatDuration, groupByTrace, type TraceGroup } from '../trace-model';

const DEFAULT_SIDEBAR_WIDTH = 360;

interface TraceViewerProps {
  /** Spans from one or more traces. Grouping into traces is handled here. */
  readonly spans: readonly OtelSpan[];
  /** Controlled sidebar width, so sibling viewers can stay in step. */
  readonly sidebarWidth?: number;
  readonly onSidebarWidthChange?: (width: number) => void;
  readonly showLogs?: boolean;
  readonly onShowLogsChange?: (show: boolean) => void;
  readonly emptyMessage?: string;
  /** Sizing for the non-fullscreen container. Defaults to a bounded height. */
  readonly className?: string;
}

/**
 * A self-contained trace explorer: a tab per trace, a gantt + span detail for
 * the active one, a logs toggle and a fullscreen escape hatch.
 *
 * Wraps {@link TraceDock} with the trace-selection and layout state that every
 * embedded consumer would otherwise reinvent.
 */
export function TraceViewer({
  spans,
  sidebarWidth,
  onSidebarWidthChange,
  showLogs,
  onShowLogsChange,
  emptyMessage = 'No spans recorded.',
  className,
}: TraceViewerProps) {
  const traces = useMemo(() => groupByTrace([...spans]), [spans]);
  const [activeTraceId, setActiveTraceId] = useState(
    () => traces[0]?.traceId ?? null,
  );
  const [fullscreen, setFullscreen] = useState(false);
  const [settingsByTrace, setSettingsByTrace] = useState<
    Record<string, TraceDockSettings>
  >({});
  const [internalSidebarWidth, setInternalSidebarWidth] = useState(
    DEFAULT_SIDEBAR_WIDTH,
  );
  const [internalShowLogs, setInternalShowLogs] = useState(false);
  const activeTabRef = useRef<HTMLButtonElement>(null);

  const resolvedSidebarWidth = sidebarWidth ?? internalSidebarWidth;
  const resolvedShowLogs = showLogs ?? internalShowLogs;
  const changeSidebarWidth = onSidebarWidthChange ?? setInternalSidebarWidth;
  const changeShowLogs = onShowLogsChange ?? setInternalShowLogs;

  useEffect(() => {
    if (!traces.some(({ traceId }) => traceId === activeTraceId)) {
      setActiveTraceId(traces[0]?.traceId ?? null);
      setSettingsByTrace({});
    }
  }, [activeTraceId, traces]);

  useEffect(() => {
    activeTabRef.current?.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
    });
  }, [activeTraceId]);

  useEffect(() => {
    if (!fullscreen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFullscreen(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [fullscreen]);

  const activeTrace =
    traces.find(({ traceId }) => traceId === activeTraceId) ?? traces[0];

  const duplicateNameCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const trace of traces) {
      counts.set(trace.name, (counts.get(trace.name) ?? 0) + 1);
    }
    return counts;
  }, [traces]);

  const traceLabel = (trace: TraceGroup) => {
    if ((duplicateNameCounts.get(trace.name) ?? 0) < 2) return trace.name;
    const duplicateIndex =
      traces
        .filter(({ name }) => name === trace.name)
        .findIndex(({ traceId }) => traceId === trace.traceId) + 1;
    return `${trace.name} #${duplicateIndex}`;
  };

  const settingsFor = (trace: TraceGroup): TraceDockSettings => ({
    ...(settingsByTrace[trace.traceId] ?? {
      open: true,
      height: 560,
      sidebarWidth: resolvedSidebarWidth,
      nameColWidth: 300,
      sidebarOpen: true,
      selectedSpanId: trace.roots[0]?.span.spanId ?? null,
    }),
    sidebarWidth: resolvedSidebarWidth,
    sidebarOpen: true,
  });

  const updateSettings = (trace: TraceGroup, next: TraceDockSettings) => {
    setSettingsByTrace((current) => ({
      ...current,
      [trace.traceId]: { ...next, sidebarOpen: true },
    }));
    if (next.sidebarWidth !== resolvedSidebarWidth) {
      changeSidebarWidth(next.sidebarWidth);
    }
  };

  return (
    <div
      className={cn(
        'overflow-hidden rounded-lg border bg-background',
        fullscreen
          ? 'fixed inset-3 z-50 h-auto min-h-0 shadow-2xl'
          : (className ?? 'h-[min(70vh,500px)]'),
      )}
    >
      {traces.length === 0 || !activeTrace ? (
        <p className="p-4 text-sm text-muted-foreground">{emptyMessage}</p>
      ) : (
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex h-11 shrink-0 items-center gap-2 border-b px-2">
            {traces.length > 1 && (
              <>
                <div
                  className={cn(
                    'min-w-0 flex-1 overflow-x-auto',
                    scrollbarStyles,
                  )}
                >
                  <div className="flex w-max items-center gap-1">
                    {traces.map((trace) => {
                      const active = trace.traceId === activeTrace.traceId;
                      return (
                        <button
                          key={trace.traceId}
                          ref={active ? activeTabRef : undefined}
                          type="button"
                          className={cn(
                            'flex h-8 max-w-64 items-center gap-2 rounded-md px-2.5 text-xs transition-colors',
                            active
                              ? 'bg-muted font-medium text-foreground'
                              : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
                          )}
                          title={`${trace.name}\n${trace.spanCount} spans\n${trace.traceId}`}
                          onClick={() => setActiveTraceId(trace.traceId)}
                        >
                          <StatusDot status={trace.status} />
                          <span className="truncate font-mono">
                            {traceLabel(trace)}
                          </span>
                          <span className="shrink-0 tabular-nums text-muted-foreground">
                            {formatDuration(trace.duration)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Choose trace"
                        title="All traces"
                      />
                    }
                  >
                    <ChevronDown aria-hidden />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-80">
                    {traces.map((trace) => (
                      <DropdownMenuItem
                        key={trace.traceId}
                        onClick={() => setActiveTraceId(trace.traceId)}
                      >
                        <StatusDot status={trace.status} />
                        <span className="min-w-0 flex-1 truncate font-mono text-xs">
                          {traceLabel(trace)}
                        </span>
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {formatDuration(trace.duration)}
                        </span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
            <label className="ml-auto flex shrink-0 cursor-pointer items-center gap-2 px-1 text-xs text-muted-foreground">
              Show logs
              <Switch
                size="sm"
                checked={resolvedShowLogs}
                onCheckedChange={changeShowLogs}
              />
            </label>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
              title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              onClick={() => setFullscreen((current) => !current)}
            >
              {fullscreen ? (
                <Minimize2 aria-hidden />
              ) : (
                <Maximize2 aria-hidden />
              )}
            </Button>
          </div>
          <div className="min-h-0 flex-1">
            {traces.map((trace) => (
              <div
                key={trace.traceId}
                className={cn(
                  'h-full',
                  trace.traceId !== activeTrace.traceId && 'hidden',
                )}
              >
                <TraceDock
                  trace={trace}
                  settings={settingsFor(trace)}
                  onSettingsChange={(next) => updateSettings(trace, next)}
                  onClose={() => undefined}
                  showHeader={false}
                  showLogs={resolvedShowLogs}
                  sidebarAlwaysOpen
                  responsiveSidebar
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
