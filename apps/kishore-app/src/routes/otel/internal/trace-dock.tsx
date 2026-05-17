import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDownIcon } from '@monorepo/frontend/lucide';
import { Button } from '@monorepo/frontend/components/ui/button';
import { Gantt } from '@monorepo/frontend/components/blocks/otel-trace-viewer/trace-dialog/gantt/gantt';
import { SpanDetail } from '@monorepo/frontend/components/blocks/otel-trace-viewer/trace-dialog/span-detail/span-detail';
import { StatusDot } from '@monorepo/frontend/components/blocks/otel-trace-viewer/status';
import {
  formatDuration,
  type OtelSpan,
  type TraceGroup,
} from '@monorepo/frontend/components/blocks/otel-trace-viewer/otel-trace-viewer';

const SIDEBAR_WIDTH_KEY = 'otel:trace-dock:sidebar-width';

interface TraceDockProps {
  trace: TraceGroup;
  onToggle: () => void;
}

export function TraceDock({ trace, onToggle }: TraceDockProps) {
  const [selectedSpan, setSelectedSpan] = useState<OtelSpan | null>(null);

  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const stored = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    const parsed = stored ? Number(stored) : NaN;
    return Number.isFinite(parsed) ? parsed : 360;
  });
  const sidebarWidthRef = useRef(sidebarWidth);
  sidebarWidthRef.current = sidebarWidth;

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth));
  }, [sidebarWidth]);

  const onSidebarDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = sidebarWidthRef.current;

    function onMouseMove(ev: MouseEvent) {
      setSidebarWidth(
        Math.max(240, Math.min(720, startW + startX - ev.clientX)),
      );
    }

    function onMouseUp() {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    }

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, []);

  function handleSpanClick(span: OtelSpan) {
    setSelectedSpan((prev) => (prev?.spanId === span.spanId ? null : span));
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
          onClick={onToggle}
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
              style={{ width: sidebarWidth }}
              className="shrink-0 overflow-hidden"
            >
              <div className="h-full overflow-y-auto">
                <SpanDetail
                  span={selectedSpan}
                  onClose={() => setSelectedSpan(null)}
                />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
