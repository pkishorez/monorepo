import {
  BookOpenText,
  ChartNoAxesGantt,
  ChevronDown,
  Layers3,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '#components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '#components/ui/dropdown-menu';
import { scrollbarStyles } from '#lib/scrollStyles';
import { cn } from '#lib/utils';

import { StatusDot } from '../status';
import { TraceDock, type TraceDockSettings } from '../trace-dock';
import type { OtelSpan } from '../trace-model';
import {
  collectSpans,
  formatDuration,
  groupByTrace,
  isLog,
  type TraceGroup,
} from '../trace-model';
import type { TraceView } from '../trace-view';

const DEFAULT_SIDEBAR_WIDTH = 360;

const VIEW_MODES = [
  {
    view: 'waterfall',
    label: 'Waterfall',
    title: 'Waterfall view',
    icon: ChartNoAxesGantt,
  },
  {
    view: 'parallel',
    label: 'Parallel',
    title: 'Parallel spans view',
    icon: Layers3,
  },
  {
    view: 'narrative',
    label: 'Narrative',
    title: 'Narrative view',
    icon: BookOpenText,
  },
] as const satisfies readonly {
  view: TraceView;
  label: string;
  title: string;
  icon: typeof ChartNoAxesGantt;
}[];

export interface TraceViewerProps {
  /** Spans from one or more traces. Grouping into traces is handled here. */
  readonly spans: readonly OtelSpan[];
  /** Controlled sidebar width, so sibling viewers can stay in step. */
  readonly sidebarWidth?: number;
  readonly onSidebarWidthChange?: (width: number) => void;
  readonly emptyMessage?: string;
  /** Controlled visualization mode. Defaults to waterfall. */
  readonly view?: TraceView;
  readonly onViewChange?: (view: TraceView) => void;
  readonly defaultView?: TraceView;
  /** Sizing for the non-fullscreen container. Defaults to a bounded height. */
  readonly className?: string;
}

/**
 * A self-contained trace explorer: a tab per trace, a gantt + span detail for
 * the active one and a fullscreen escape hatch.
 *
 * Wraps {@link TraceDock} with the trace-selection and layout state that every
 * embedded consumer would otherwise reinvent.
 */
export function TraceViewer({
  spans,
  sidebarWidth,
  onSidebarWidthChange,
  emptyMessage = 'No spans recorded.',
  view,
  onViewChange,
  defaultView = 'waterfall',
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
  const [internalView, setInternalView] = useState<TraceView>(defaultView);
  const activeTabRef = useRef<HTMLButtonElement>(null);

  const resolvedSidebarWidth = sidebarWidth ?? internalSidebarWidth;
  const changeSidebarWidth = onSidebarWidthChange ?? setInternalSidebarWidth;
  const resolvedView = view ?? internalView;
  const changeView = onViewChange ?? setInternalView;

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

  const activeTraceLogCount = useMemo(
    () =>
      activeTrace
        ? collectSpans(activeTrace.roots).reduce(
            (count, span) =>
              count + span.events.filter((event) => isLog(event)).length,
            0,
          )
        : 0,
    [activeTrace],
  );

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
            {traces.length === 1 ? (
              <div
                className="flex min-w-0 flex-1 items-center gap-2 px-1"
                title={activeTrace.traceId}
              >
                <StatusDot status={activeTrace.status} />
                <span className="min-w-0 truncate font-mono text-xs font-medium">
                  {activeTrace.name}
                </span>
                {activeTrace.serviceName && (
                  <span className="hidden truncate text-xs text-muted-foreground md:inline">
                    {activeTrace.serviceName}
                  </span>
                )}
                <span className="ml-1 shrink-0 text-[10px] tabular-nums text-muted-foreground">
                  {activeTrace.spanCount} spans
                </span>
                {activeTraceLogCount > 0 && (
                  <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                    {activeTraceLogCount} logs
                  </span>
                )}
                <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
                  {formatDuration(activeTrace.duration)}
                </span>
              </div>
            ) : (
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
            <div className="ml-auto flex shrink-0 items-center rounded-md border border-border/70 bg-muted/30 p-0.5">
              {VIEW_MODES.map(({ view: mode, label, title, icon: Icon }) => (
                <button
                  aria-pressed={resolvedView === mode}
                  className={cn(
                    'flex h-7 items-center gap-1.5 rounded px-2 text-xs text-muted-foreground transition-colors hover:text-foreground',
                    resolvedView === mode &&
                      'bg-background text-foreground shadow-sm',
                  )}
                  key={mode}
                  onClick={() => changeView(mode)}
                  title={title}
                  type="button"
                >
                  <Icon aria-hidden className="size-3.5" />
                  <span className="max-[700px]:sr-only">{label}</span>
                </button>
              ))}
            </div>
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
                  sidebarAlwaysOpen
                  responsiveSidebar
                  view={resolvedView}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
