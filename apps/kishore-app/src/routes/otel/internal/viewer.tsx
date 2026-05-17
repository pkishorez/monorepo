import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from '@tanstack/react-db';
import { SearchIcon } from '@monorepo/frontend/lucide';
import { Button } from '@monorepo/frontend/components/ui/button';
import { Kbd } from '@monorepo/frontend/components/ui/kbd';
import { OtelTraceViewer } from '@monorepo/frontend/components/blocks/otel-trace-viewer/otel-trace-viewer';
import {
  groupByTrace,
  type TraceGroup,
} from '@monorepo/frontend/components/blocks/otel-trace-viewer/otel-trace-viewer';
import {
  transformLog,
  transformSpan,
} from '@monorepo/frontend/lib/lotel-transform';
import { scrollbarStyles } from '@monorepo/frontend/lib/scrollStyles';
import { cn } from '@monorepo/frontend/lib/utils';
import type {
  StoredLogRecordValue,
  StoredTraceRecordValue,
} from 'lotel/client';
import type { OtelCollections } from './collections';
import { FilterBar } from './filter-bar';
import { TraceDock } from './trace-dock';
import {
  applyFilters,
  discoverAttributeKeys,
  discoverAttributeValues,
  discoverServiceNames,
  useFilters,
} from './use-filters';

export function Viewer({ collections }: { collections: OtelCollections }) {
  const { data: traceItems } = useLiveQuery(collections.traces);
  const { data: logItems } = useLiveQuery(collections.logs);

  const spans = useMemo(
    () => joinSpansWithLogs(traceItems, logItems),
    [traceItems, logItems],
  );
  const allTraces = useMemo(() => groupByTrace(spans), [spans]);

  const {
    filters,
    setServiceName,
    setSinceNow,
    clearSinceNow,
    addAttributeFilter,
    removeAttributeFilter,
  } = useFilters();

  const serviceNames = useMemo(() => discoverServiceNames(spans), [spans]);
  const attributeKeys = useMemo(() => discoverAttributeKeys(spans), [spans]);
  const getAttributeValues = useCallback(
    (key: string) => discoverAttributeValues(spans, key),
    [spans],
  );

  const { visible: traces, hiddenBySinceNow } = useMemo(
    () => applyFilters(allTraces, spans, filters),
    [allTraces, spans, filters],
  );

  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);
  const [dockOpen, setDockOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const selectedTrace = useMemo(
    () =>
      selectedTraceId
        ? (allTraces.find((t) => t.traceId === selectedTraceId) ?? null)
        : null,
    [allTraces, selectedTraceId],
  );

  const handleSelectTrace = useCallback(
    (trace: TraceGroup) => {
      if (trace.traceId === selectedTraceId) {
        setDockOpen((open) => !open);
      } else {
        setSelectedTraceId(trace.traceId);
        setDockOpen(true);
      }

      const traceSpans = spans.filter((s) => s.traceId === trace.traceId);
      console.group(`[otel] ${trace.name} — ${trace.traceId}`);
      if (trace.missingRoot)
        console.warn('⚠ No root span (parentSpanId === null is absent)');
      console.table(
        traceSpans.map((s) => ({
          spanId: s.spanId,
          parentSpanId: s.parentSpanId ?? '(root)',
          name: s.name,
          status: s.status,
          duration:
            s.endTime !== null ? `${s.endTime - s.startTime}ms` : 'running',
          attributes: s.attributes,
        })),
      );
      console.groupEnd();
    },
    [spans, selectedTraceId],
  );

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setPaletteOpen(true);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const [dockHeight, setDockHeight] = useState(300);
  const dockHeightRef = useRef(dockHeight);
  dockHeightRef.current = dockHeight;

  const onDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = dockHeightRef.current;

    function onMouseMove(ev: MouseEvent) {
      setDockHeight(Math.max(120, Math.min(600, startH + startY - ev.clientY)));
    }

    function onMouseUp() {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    }

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, []);

  return (
    <div className="flex h-full flex-col">
      {/* Sticky top bar: filters + hidden count + trace count + search */}
      <div className="shrink-0 border-b border-border/40 bg-background px-6 py-3 max-w-7xl mx-auto w-full">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <FilterBar
            serviceNames={serviceNames}
            attributeKeys={attributeKeys}
            getAttributeValues={getAttributeValues}
            filters={filters}
            onServiceChange={setServiceName}
            onSinceNow={() => setSinceNow(Date.now())}
            onClearSinceNow={clearSinceNow}
            onAddAttributeFilter={addAttributeFilter}
            onRemoveAttributeFilter={removeAttributeFilter}
          />
          <div className="flex items-center gap-3 shrink-0">
            {hiddenBySinceNow > 0 && (
              <span className="text-xs text-muted-foreground">
                ↑ {hiddenBySinceNow} hidden
              </span>
            )}
            <span className="text-xs text-muted-foreground">
              {traces.length} trace{traces.length !== 1 ? 's' : ''}
            </span>
            <Button
              variant="outline"
              size="xs"
              onClick={() => setPaletteOpen(true)}
              className="gap-1.5"
            >
              <SearchIcon className="size-3" />
              Search
              <Kbd>⌘K</Kbd>
            </Button>
          </div>
        </div>
      </div>

      {/* Scrollable trace list */}
      <div
        className={cn(
          'min-h-0 flex-1 overflow-auto px-6 py-4 max-w-7xl mx-auto w-full',
          scrollbarStyles,
        )}
      >
        <OtelTraceViewer
          traces={traces}
          selectedTraceId={selectedTraceId}
          onSelectTrace={handleSelectTrace}
          paletteOpen={paletteOpen}
          onPaletteOpenChange={setPaletteOpen}
          showListHeader={false}
        />
      </div>

      {/* Full-width dock */}
      {selectedTrace && dockOpen && (
        <>
          <div
            className="h-1 shrink-0 cursor-row-resize bg-border transition-colors hover:bg-primary/20"
            onMouseDown={onDividerMouseDown}
          />
          <div style={{ height: dockHeight }} className="shrink-0">
            <TraceDock
              key={selectedTrace.traceId}
              trace={selectedTrace}
              onToggle={() => setDockOpen(false)}
            />
          </div>
        </>
      )}
    </div>
  );
}

function joinSpansWithLogs(
  traceItems: ReadonlyArray<StoredTraceRecordValue & { _meta?: unknown }>,
  logItems: ReadonlyArray<StoredLogRecordValue & { _meta?: unknown }>,
) {
  const spans = traceItems.map((t) => transformSpan(t));

  const byKey = new Map<string, (typeof spans)[number]>();
  for (const span of spans) {
    if (span.traceId && span.spanId) {
      byKey.set(`${span.traceId}:${span.spanId}`, span);
    }
  }

  for (const log of logItems) {
    const traceId = log.record.traceId;
    const spanId = log.record.spanId;
    if (!traceId || !spanId) continue;
    const span = byKey.get(`${traceId}:${spanId}`);
    if (!span) continue;
    span.events.push(transformLog(log));
  }

  return spans;
}
