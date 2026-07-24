import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDownIcon } from 'lucide-react';

import { Button } from '#components/ui/button';
import { scrollbarStyles } from '#lib/scrollStyles';
import { cn } from '#lib/utils';

import { StatusDot } from '../status';
import { Gantt } from '../gantt/gantt';
import { LogSpanDetail } from '../span-detail/log-span-detail';
import { SpanDetail } from '../span-detail/span-detail';
import type { OtelEvent, OtelSpan } from '../trace-model';
import { collectSpans, formatDuration, type TraceGroup } from '../trace-model';

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
  showLogs?: boolean;
  sidebarAlwaysOpen?: boolean;
  responsiveSidebar?: boolean;
}

export function TraceDock({
  trace,
  settings,
  onSettingsChange,
  onClose,
  showHeader = true,
  showLogs = false,
  sidebarAlwaysOpen = false,
  responsiveSidebar = false,
}: TraceDockProps) {
  const orderedSpans = useMemo(() => collectSpans(trace.roots), [trace.roots]);
  const [selectedLog, setSelectedLog] = useState<{
    readonly span: OtelSpan;
    readonly event: OtelEvent;
  } | null>(null);

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

  useEffect(() => {
    setSelectedLog(null);
  }, [trace.traceId, showLogs]);

  const widthRef = useRef(settings.sidebarWidth);
  widthRef.current = settings.sidebarWidth;

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
    setSelectedLog(null);
    if (
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

  function handleLogClick(span: OtelSpan, event: OtelEvent) {
    setSelectedLog({ span, event });
    onSettingsChange({
      ...settings,
      sidebarOpen: true,
      selectedSpanId: span.spanId,
    });
  }

  function closeSidebar() {
    onSettingsChange({ ...settings, sidebarOpen: false });
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
          <Gantt
            trace={trace}
            selectedSpanId={selectedSpan?.spanId ?? null}
            selectedLog={selectedLog?.event ?? null}
            onSpanClick={handleSpanClick}
            onLogClick={handleLogClick}
            showLogs={showLogs}
            nameColWidth={settings.nameColWidth}
            onNameColWidthChange={(next) =>
              onSettingsChange({ ...settings, nameColWidth: next })
            }
          />
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
                {selectedLog ? (
                  <LogSpanDetail
                    event={selectedLog.event}
                    span={selectedLog.span}
                    traceStart={trace.startTime}
                  />
                ) : (
                  <SpanDetail
                    span={selectedSpan}
                    traceStart={trace.startTime}
                    showLogs={!showLogs}
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
