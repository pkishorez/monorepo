import { useCallback, useMemo, useRef, useState } from 'react';
import { inArray, max, useLiveQuery } from '@tanstack/react-db';
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
  StatusFilter,
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

const PAGE_SIZE = 20;

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
  const columnWidths = useLotelStore((s) => s.columnWidths);
  const setColumnWidth = useLotelStore((s) => s.setColumnWidth);

  const attributeKeys = useMemo(() => discoverAttributeKeys(spans), [spans]);
  const getAttributeValues = useCallback(
    (key: string) => discoverAttributeValues(spans, key),
    [spans],
  );

  const { visible: filtered, hiddenBySinceNow } = useMemo(
    () => applyFilters(allTraces, spans, filters),
    [allTraces, spans, filters],
  );

  // A stable "freeze line" keeps streaming traces from shoving the list around:
  // traces that first appear after `pivot` (wall-clock ms, captured when the
  // view was last flushed) are held behind a click-to-reveal banner rather than
  // spliced in live. Everything at/below the line is the eligible set we page.
  const [pivot, setPivot] = useState(() => Date.now());
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const frozenIds = useMemo(
    () => filtered.filter((t) => t.startTime <= pivot).map((t) => t.traceId),
    [filtered, pivot],
  );
  const bufferedCount = useMemo(
    () => filtered.filter((t) => t.startTime > pivot).length,
    [filtered, pivot],
  );

  // Sort + limit happen inside TanStack DB: group the frozen traces' spans by
  // traceId, rank by newest ingested span (monotonic ULID `id`), and take the
  // visible window. Filtering stays client-side (cross-span predicates over the
  // nested resource kvlist), so we feed the eligible ids in via `inArray`.
  const { data: windowRows } = useLiveQuery(
    (q) =>
      q
        .from({ s: collections.traces })
        .where(({ s }) => inArray(s.record.traceId, frozenIds))
        .groupBy(({ s }) => s.record.traceId)
        .select(({ s }) => ({ traceId: s.record.traceId, rank: max(s.id) }))
        .orderBy(({ s }) => max(s.id), 'desc')
        .limit(visibleCount),
    [frozenIds, visibleCount],
  );

  const tracesById = useMemo(() => {
    const map = new Map<string, TraceGroup>();
    for (const t of allTraces) map.set(t.traceId, t);
    return map;
  }, [allTraces]);

  const shownTraces = useMemo(
    () =>
      windowRows
        .map((r) => (r.traceId ? tracesById.get(r.traceId) : undefined))
        .filter((t): t is TraceGroup => t != null),
    [windowRows, tracesById],
  );

  const hasMore = frozenIds.length > visibleCount;

  const revealNew = useCallback(() => {
    setPivot(Date.now());
    setVisibleCount(PAGE_SIZE);
  }, []);

  const showMore = useCallback(() => setVisibleCount((c) => c + PAGE_SIZE), []);

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
              <StatusFilter filters={filters} onFiltersChange={setFilters} />
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
                {filtered.length} trace{filtered.length !== 1 ? 's' : ''}
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
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center rounded-lg border border-border p-10 text-sm text-muted-foreground">
            No traces
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <GroupedList
              traces={shownTraces}
              spans={spans}
              settings={traceListSettings}
              columnWidths={columnWidths}
              newCount={bufferedCount}
              onRevealNew={revealNew}
              onColumnWidthChange={setColumnWidth}
              onSettingsChange={setTraceListSettings}
              onSelectTrace={handleSelectTrace}
            />
            {hasMore && (
              <button
                type="button"
                onClick={showMore}
                className="self-center rounded-md border border-border px-4 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
              >
                Show more
              </button>
            )}
          </div>
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
