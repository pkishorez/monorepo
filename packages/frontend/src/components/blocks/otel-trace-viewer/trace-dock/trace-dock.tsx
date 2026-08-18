import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDownIcon } from 'lucide-react';

import { Button } from '#components/ui/button';
import { scrollbarStyles } from '#lib/scrollStyles';
import { cn } from '#lib/utils';

import { StatusDot } from '../trace-presentation';
import { Gantt } from '../waterfall-view';
import { Narrative } from '../narrative-view';
import { ParallelTimeline } from '../parallel-view';
import {
  LogSpanDetail,
  OverlapSpanSummary,
  SpanDetail,
} from '../span-inspection';
import type { OtelEvent, OtelSpan } from '../trace-model';
import { collectSpans, formatDuration, type TraceGroup } from '../trace-model';
import type { TraceView } from '../trace-presentation';

export type TraceDockSettings = {
  open: boolean;
  height: number;
  sidebarWidth: number;
  nameColWidth: number;
  sidebarOpen: boolean;
  selectedSpanId: string | null;
};

interface TraceDockProps {
  trace: TraceGroup;
  settings: TraceDockSettings;
  onSettingsChange: (next: TraceDockSettings) => void;
  onClose: () => void;
  showHeader?: boolean;
  sidebarAlwaysOpen?: boolean;
  responsiveSidebar?: boolean;
  view?: TraceView;
}

export function TraceDock({
  trace,
  settings,
  onSettingsChange,
  onClose,
  showHeader = true,
  sidebarAlwaysOpen = false,
  responsiveSidebar = false,
  view = 'waterfall',
}: TraceDockProps) {
  const orderedSpans = useMemo(() => collectSpans(trace.roots), [trace.roots]);
  const [overlapCandidates, setOverlapCandidates] = useState<
    readonly OtelSpan[] | null
  >(null);
  const [choosingOverlap, setChoosingOverlap] = useState(false);
  const [focusedParallelSpanId, setFocusedParallelSpanId] = useState<
    string | null
  >(null);
  const [hoveredOverlapSpanId, setHoveredOverlapSpanId] = useState<
    string | null
  >(null);
  const [selectedLog, setSelectedLog] = useState<{
    readonly span: OtelSpan;
    readonly event: OtelEvent;
  } | null>(null);
  const [hoveredLog, setHoveredLog] = useState<OtelEvent | null>(null);
  const [focusWaterfallPath, setFocusWaterfallPath] = useState(false);
  const highlightedOverlapSpanIds = useMemo(
    () =>
      choosingOverlap && overlapCandidates
        ? new Set(overlapCandidates.map((span) => span.spanId))
        : new Set<string>(),
    [choosingOverlap, overlapCandidates],
  );
  const selectedSpan = useMemo(() => {
    if (!sidebarAlwaysOpen && !settings.sidebarOpen) return null;
    if (orderedSpans.length === 0) return null;
    const byId = settings.selectedSpanId
      ? orderedSpans.find((s) => s.spanId === settings.selectedSpanId)
      : null;
    return byId ?? orderedSpans[0] ?? null;
  }, [
    orderedSpans,
    settings.selectedSpanId,
    settings.sidebarOpen,
    sidebarAlwaysOpen,
  ]);

  const widthRef = useRef(settings.sidebarWidth);
  widthRef.current = settings.sidebarWidth;

  useEffect(() => {
    setOverlapCandidates(null);
    setChoosingOverlap(false);
    setFocusedParallelSpanId(null);
    setHoveredOverlapSpanId(null);
    setSelectedLog(null);
    setHoveredLog(null);
  }, [trace.traceId, view]);

  const onSidebarDividerMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startW = widthRef.current;

      function onMouseMove(ev: MouseEvent) {
        const next = Math.max(240, startW + startX - ev.clientX);
        widthRef.current = next;
        onSettingsChange({ ...settings, sidebarWidth: next });
      }

      function onMouseUp() {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      }

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    },
    [onSettingsChange, settings],
  );

  function handleSpanClick(span: OtelSpan) {
    setOverlapCandidates(null);
    setChoosingOverlap(false);
    setFocusedParallelSpanId(null);
    setHoveredOverlapSpanId(null);
    setSelectedLog(null);
    setHoveredLog(null);
    if (
      view === 'parallel' &&
      !sidebarAlwaysOpen &&
      settings.sidebarOpen &&
      settings.selectedSpanId === span.spanId
    ) {
      onSettingsChange({ ...settings, sidebarOpen: false });
    } else {
      onSettingsChange({
        ...settings,
        sidebarOpen: true,
        selectedSpanId: span.spanId,
      });
    }
  }

  function handleOverlapClick(spans: readonly OtelSpan[]) {
    setOverlapCandidates(spans);
    setChoosingOverlap(true);
    setFocusedParallelSpanId(null);
    setHoveredOverlapSpanId(null);
    setSelectedLog(null);
    setHoveredLog(null);
    onSettingsChange({
      ...settings,
      sidebarOpen: true,
    });
  }

  function cancelOverlap() {
    setOverlapCandidates(null);
    setChoosingOverlap(false);
    setHoveredOverlapSpanId(null);
  }

  function selectOverlap(span: OtelSpan) {
    setChoosingOverlap(false);
    setFocusedParallelSpanId(span.spanId);
    setHoveredOverlapSpanId(null);
    setSelectedLog(null);
    setHoveredLog(null);
    onSettingsChange({
      ...settings,
      sidebarOpen: true,
      selectedSpanId: span.spanId,
    });
  }

  function closeSidebar() {
    onSettingsChange({ ...settings, sidebarOpen: false });
  }

  function selectLog(span: OtelSpan, event: OtelEvent) {
    setSelectedLog({ span, event });
    setHoveredLog(null);
    onSettingsChange({
      ...settings,
      sidebarOpen: true,
      selectedSpanId: span.spanId,
    });
  }

  return (
    <div
      className={cn(
        'flex h-full flex-col overflow-hidden',
        showHeader && 'rounded-lg border border-border',
      )}
    >
      {showHeader && (
        <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-2.5">
          <StatusDot status={trace.status} />
          <span className="flex-1 truncate font-mono text-sm font-medium">
            {trace.name}
          </span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {trace.spanCount} span{trace.spanCount !== 1 ? 's' : ''} ·{' '}
            {formatDuration(trace.duration)}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            className="shrink-0"
          >
            <ChevronDownIcon className="size-4" />
            <span className="sr-only">Collapse</span>
          </Button>
        </div>
      )}

      <div
        className={cn(
          'flex min-h-0 flex-1 overflow-hidden',
          responsiveSidebar && 'max-[900px]:flex-col',
        )}
      >
        <div className={cn('min-w-0 flex-1 overflow-y-auto', scrollbarStyles)}>
          {view === 'waterfall' ? (
            <Gantt
              trace={trace}
              selectedSpanId={selectedSpan?.spanId ?? null}
              onSpanClick={handleSpanClick}
              focusPath={focusWaterfallPath}
              onFocusPathChange={setFocusWaterfallPath}
              selectedLog={selectedLog?.event ?? null}
              hoveredLog={hoveredLog}
              onLogClick={selectLog}
              onLogHover={setHoveredLog}
              nameColWidth={settings.nameColWidth}
              onNameColWidthChange={(next) =>
                onSettingsChange({ ...settings, nameColWidth: next })
              }
            />
          ) : view === 'parallel' ? (
            <ParallelTimeline
              trace={trace}
              selectedSpanId={
                choosingOverlap ? null : (selectedSpan?.spanId ?? null)
              }
              focusedSpanId={focusedParallelSpanId}
              highlightedOverlapSpanIds={highlightedOverlapSpanIds}
              hoveredOverlapSpanId={hoveredOverlapSpanId}
              onSpanClick={handleSpanClick}
              onOverlapClick={handleOverlapClick}
              onOverlapCancel={cancelOverlap}
              onOverlapHover={(span) =>
                setHoveredOverlapSpanId(span?.spanId ?? null)
              }
              onOverlapSelect={selectOverlap}
            />
          ) : (
            <Narrative
              trace={trace}
              selectedSpanId={selectedSpan?.spanId ?? null}
              onSpanClick={handleSpanClick}
              selectedLog={selectedLog?.event ?? null}
              onLogClick={selectLog}
            />
          )}
        </div>
        {selectedSpan && (
          <>
            <div
              className={cn(
                'w-1 shrink-0 cursor-col-resize bg-border transition-colors hover:bg-primary/20',
                responsiveSidebar && 'max-[900px]:hidden',
              )}
              onMouseDown={onSidebarDividerMouseDown}
            />
            <div
              style={{ width: settings.sidebarWidth }}
              className={cn(
                'shrink-0 overflow-hidden',
                responsiveSidebar &&
                  'max-[900px]:max-h-[45%] max-[900px]:w-full! max-[900px]:border-t',
              )}
            >
              <div className={cn('h-full overflow-y-auto', scrollbarStyles)}>
                {choosingOverlap && overlapCandidates ? (
                  <OverlapSpanSummary spans={overlapCandidates} />
                ) : selectedLog && view !== 'parallel' ? (
                  <LogSpanDetail
                    event={selectedLog.event}
                    span={selectedLog.span}
                    traceStart={trace.startTime}
                  />
                ) : (
                  <SpanDetail
                    span={selectedSpan}
                    traceStart={trace.startTime}
                    onClose={sidebarAlwaysOpen ? undefined : closeSidebar}
                  />
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
