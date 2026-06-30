import { useCallback, useMemo, useRef } from 'react';
import { useLiveQuery } from '@tanstack/react-db';
import {
  groupByTrace,
  TraceDock,
  type TraceGroup,
  transformLog,
  transformSpan,
} from '@monorepo/frontend/components/blocks/otel-trace-viewer';
import { scrollbarStyles } from '@monorepo/frontend/lib/scrollStyles';
import { cn } from '@monorepo/frontend/lib/utils';
import type {
  StoredLogRecordValue,
  StoredTraceRecordValue,
} from '@kishorez/lotel/client';
import type { TelemetryCollections } from './collections';
import {
  FilterControls,
  FilterPills,
  GroupByControl,
  ServiceFilter,
} from './filter-bar';
import { GroupedList } from './grouped-list';
import { ServiceGlossary } from './service-glossary';
import {
  applyFilters,
  computeServiceInsights,
  discoverAttributeKeys,
  discoverAttributeValues,
  discoverServiceOptions,
  SERVICE_ATTR_KEY,
} from './filters';
import { useLotelStore } from './store';

export function Viewer({ collections }: { collections: TelemetryCollections }) {
  const { data: traceItems } = useLiveQuery(collections.traces);
  const { data: logItems } = useLiveQuery(collections.logs);

  const spans = useMemo(
    () => joinSpansWithLogs(traceItems, logItems),
    [traceItems, logItems],
  );
  const allTraces = useMemo(() => groupByTrace(spans), [spans]);

  const filters = useLotelStore((s) => s.filters);
  const setFilters = useLotelStore((s) => s.setFilters);
  const traceListSettings = useLotelStore((s) => s.traceList);
  const setTraceListSettings = useLotelStore((s) => s.setTraceList);
  const dockSettings = useLotelStore((s) => s.dock);
  const setDockSettings = useLotelStore((s) => s.setDock);

  const attributeKeys = useMemo(() => discoverAttributeKeys(spans), [spans]);
  const getAttributeValues = useCallback(
    (key: string) => discoverAttributeValues(spans, key),
    [spans],
  );

  const { visible: traces, hiddenBySinceNow } = useMemo(
    () => applyFilters(allTraces, spans, filters),
    [allTraces, spans, filters],
  );

  const tracesWithoutServiceFilter = useMemo(() => {
    const withoutService = {
      ...filters,
      attributeFilters: filters.attributeFilters.filter(
        (f) => f.key !== SERVICE_ATTR_KEY,
      ),
    };
    return applyFilters(allTraces, spans, withoutService).visible;
  }, [allTraces, spans, filters]);

  const serviceOptions = useMemo(
    () => discoverServiceOptions(allTraces, tracesWithoutServiceFilter),
    [allTraces, tracesWithoutServiceFilter],
  );

  const serviceInsights = useMemo(
    () => computeServiceInsights(tracesWithoutServiceFilter),
    [tracesWithoutServiceFilter],
  );

  const selectedService =
    filters.attributeFilters.find((f) => f.key === SERVICE_ATTR_KEY)?.value ??
    null;

  const selectService = useCallback(
    (name: string) => {
      const withoutService = filters.attributeFilters.filter(
        (f) => f.key !== SERVICE_ATTR_KEY,
      );
      setFilters({
        ...filters,
        attributeFilters: [
          ...withoutService,
          { id: crypto.randomUUID(), key: SERVICE_ATTR_KEY, value: name },
        ],
      });
    },
    [filters, setFilters],
  );

  const selectedTrace = useMemo<TraceGroup | null>(
    () =>
      traceListSettings.selectedTraceId
        ? (allTraces.find(
            (t) => t.traceId === traceListSettings.selectedTraceId,
          ) ?? null)
        : null,
    [allTraces, traceListSettings.selectedTraceId],
  );

  const heightRef = useRef(dockSettings.height);
  heightRef.current = dockSettings.height;

  const onDividerMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startY = e.clientY;
      const startH = heightRef.current;

      function onMouseMove(ev: MouseEvent) {
        const next = Math.max(120, startH + startY - ev.clientY);
        heightRef.current = next;
        setDockSettings({ ...dockSettings, height: next });
      }

      function onMouseUp() {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      }

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    },
    [dockSettings, setDockSettings],
  );

  const dockVisible = selectedTrace !== null && dockSettings.open;

  const handleSelectTrace = useCallback(
    (trace: TraceGroup) => {
      const prevId = traceListSettings.selectedTraceId;
      if (trace.traceId === prevId) {
        setDockSettings({ ...dockSettings, open: !dockSettings.open });
      } else {
        setTraceListSettings({
          ...traceListSettings,
          selectedTraceId: trace.traceId,
        });
        setDockSettings({ ...dockSettings, open: true });
      }
    },
    [dockSettings, setDockSettings, setTraceListSettings, traceListSettings],
  );

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-border/40 bg-background px-6 pt-3 pb-2 max-w-7xl mx-auto w-full">
        <div className="flex items-center justify-between gap-4">
          <div className="flex shrink-0 items-center gap-1.5">
            <ServiceFilter
              filters={filters}
              onFiltersChange={setFilters}
              options={serviceOptions}
            />
            <FilterControls
              filters={filters}
              onFiltersChange={setFilters}
              attributeKeys={attributeKeys}
              getAttributeValues={getAttributeValues}
            />
          </div>
          {selectedService !== null && (
            <div className="flex shrink-0 items-center gap-3">
              <GroupByControl
                value={traceListSettings.groupBy}
                onChange={(next) =>
                  setTraceListSettings({
                    ...traceListSettings,
                    groupBy: next,
                  })
                }
                attributeKeys={attributeKeys}
              />
              {hiddenBySinceNow > 0 && (
                <span className="text-xs text-muted-foreground">
                  ↑ {hiddenBySinceNow} hidden
                </span>
              )}
              <span className="text-xs text-muted-foreground">
                {traces.length} trace{traces.length !== 1 ? 's' : ''}
              </span>
            </div>
          )}
        </div>
        {(filters.attributeFilters.some((f) => f.key !== SERVICE_ATTR_KEY) ||
          filters.sinceNow !== null) && (
          <div className="mt-2">
            <FilterPills filters={filters} onFiltersChange={setFilters} />
          </div>
        )}
      </div>

      <div
        className={cn(
          'min-h-0 flex-1 overflow-auto px-6 py-4 max-w-7xl mx-auto w-full',
          scrollbarStyles,
        )}
      >
        {selectedService === null ? (
          <ServiceGlossary
            insights={serviceInsights}
            onSelectService={selectService}
          />
        ) : traces.length === 0 ? (
          <div className="flex items-center justify-center rounded-lg border border-border p-10 text-sm text-muted-foreground">
            No traces
          </div>
        ) : (
          <GroupedList
            traces={traces}
            spans={spans}
            settings={traceListSettings}
            onSettingsChange={setTraceListSettings}
            onSelectTrace={handleSelectTrace}
          />
        )}
      </div>

      {dockVisible && selectedTrace && (
        <>
          <div
            className="h-1 shrink-0 cursor-row-resize bg-border transition-colors hover:bg-primary/20"
            onMouseDown={onDividerMouseDown}
          />
          <div style={{ height: dockSettings.height }} className="shrink-0">
            <TraceDock
              key={selectedTrace.traceId}
              trace={selectedTrace}
              settings={dockSettings}
              onSettingsChange={setDockSettings}
              onClose={() => setDockSettings({ ...dockSettings, open: false })}
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
