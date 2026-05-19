import { useCallback, useMemo, useRef } from 'react';
import { ChevronDownIcon } from 'lucide-react';

import { Button } from '#components/ui/button';

import { StatusDot } from '../status';
import { Gantt } from '../trace-dialog/gantt/gantt';
import { SpanDetail } from '../trace-dialog/span-detail/span-detail';
import type { OtelSpan } from '../types';
import { collectSpans, formatDuration, type TraceGroup } from '../utils';

export type TraceDockSettings = {
  open: boolean;
  height: number;
  sidebarWidth: number;
  sidebarOpen: boolean;
  selectedSpanId: string | null;
};

interface TraceDockProps {
  trace: TraceGroup;
  settings: TraceDockSettings;
  onSettingsChange: (next: TraceDockSettings) => void;
  onClose: () => void;
}

export function TraceDock({
  trace,
  settings,
  onSettingsChange,
  onClose,
}: TraceDockProps) {
  const orderedSpans = useMemo(() => collectSpans(trace.roots), [trace.roots]);

  const selectedSpan = useMemo(() => {
    if (!settings.sidebarOpen) return null;
    if (orderedSpans.length === 0) return null;
    const byId = settings.selectedSpanId
      ? orderedSpans.find((s) => s.spanId === settings.selectedSpanId)
      : null;
    return byId ?? orderedSpans[0] ?? null;
  }, [settings.sidebarOpen, settings.selectedSpanId, orderedSpans]);

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
    if (settings.sidebarOpen && settings.selectedSpanId === span.spanId) {
      onSettingsChange({ ...settings, sidebarOpen: false });
    } else {
      onSettingsChange({
        ...settings,
        sidebarOpen: true,
        selectedSpanId: span.spanId,
      });
    }
  }

  function closeSidebar() {
    onSettingsChange({ ...settings, sidebarOpen: false });
  }

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border border-border">
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

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="min-w-0 flex-1 overflow-y-auto">
          <Gantt
            trace={trace}
            selectedSpanId={selectedSpan?.spanId ?? null}
            onSpanClick={handleSpanClick}
          />
        </div>
        {selectedSpan && (
          <>
            <div
              className="w-1 shrink-0 cursor-col-resize bg-border transition-colors hover:bg-primary/20"
              onMouseDown={onSidebarDividerMouseDown}
            />
            <div
              style={{ width: settings.sidebarWidth }}
              className="shrink-0 overflow-hidden"
            >
              <div className="h-full overflow-y-auto">
                <SpanDetail span={selectedSpan} onClose={closeSidebar} />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
