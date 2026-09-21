import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from '@tanstack/react-db';
import { useNavigate, useSearch } from '@tanstack/react-router';
import {
  attachLogs,
  groupByTrace,
  transformLog,
  transformSpan,
} from 'kui-toolkit/components/blocks/otel-trace-viewer';
import type { OtelEvent } from 'kui-toolkit/components/blocks/otel-trace-viewer/trace-model';
import type { TraceView } from 'kui-toolkit/components/blocks/otel-trace-viewer/trace-presentation';
import { SearchIcon } from 'kui-toolkit/lucide';
import { scrollbarStyles } from 'kui-toolkit/lib/scrollStyles';
import { cn } from 'kui-toolkit/lib/utils';
import type {
  LogRecord,
  SpanRecord,
  TelemetryCollections,
} from '../collections';
import {
  applyFilters,
  discoverAttributeKeys,
  discoverAttributeValues,
  effectiveService,
  formatServiceName,
  SERVICE_ATTR_KEY,
} from './filtering';
import { useLotelStore } from './state';
import { FilterControls, FilterPills, GroupByControl } from './filter-bar';
import { Header } from './header';
import { TraceFeed } from './trace-feed';
import { TraceWorkspace } from './trace-workspace';

const PAGE_SIZE = 30;

export function Viewer({
  collections,
  onClear,
}: {
  collections: TelemetryCollections;
  onClear: () => Promise<number>;
}) {
  const search = useSearch({ from: '/lotel' });
  const navigate = useNavigate();
  const selectedTraceId = search.trace ?? null;
  const requestedSpanId = search.span ?? null;

  const { data: traceItems, isReady: tracesReady } = useLiveQuery(
    collections.traces,
  );
  const { data: logItems } = useLiveQuery(collections.logs);

  const spans = useMemo(
    () => joinSpansWithLogs(traceItems, logItems),
    [traceItems, logItems],
  );
  const allTraces = useMemo(
    () => groupByTrace(spans).sort((a, b) => b.startTime - a.startTime),
    [spans],
  );
  const filters = useLotelStore((state) => state.filters);
  const setFilters = useLotelStore((state) => state.setFilters);
  const traceListSettings = useLotelStore((state) => state.traceList);
  const setTraceListSettings = useLotelStore((state) => state.setTraceList);
  const dockSettings = useLotelStore((state) => state.dock);
  const setDockSettings = useLotelStore((state) => state.setDock);

  const [traceSearch, setTraceSearch] = useState('');
  const [traceView, setTraceView] = useState<TraceView>('waterfall');
  const [listWidth, setListWidth] = useState(360);
  const [traceCount, setTraceCount] = useState(PAGE_SIZE);

  const attributeKeys = useMemo(() => discoverAttributeKeys(spans), [spans]);
  const getAttributeValues = useCallback(
    (key: string) => discoverAttributeValues(spans, key),
    [spans],
  );

  const serviceNames = useMemo(
    () =>
      Array.from(
        new Set(
          allTraces
            .map(effectiveService)
            .filter((service): service is string => service !== null),
        ),
      ).sort(),
    [allTraces],
  );
  const selectedService =
    filters.attributeFilters.find((filter) => filter.key === SERVICE_ATTR_KEY)
      ?.value ?? null;

  const filteredTraces = useMemo(() => {
    const filtered = applyFilters(allTraces, spans, filters).visible;
    const query = traceSearch.trim().toLowerCase();
    if (!query) return filtered;
    return filtered.filter(
      (trace) =>
        trace.name.toLowerCase().includes(query) ||
        trace.traceId.toLowerCase().includes(query) ||
        trace.serviceName?.toLowerCase().includes(query),
    );
  }, [allTraces, filters, spans, traceSearch]);

  const traceBuffer = useBufferedIds(
    filteredTraces.map((trace) => trace.traceId),
    selectedTraceId !== null,
    tracesReady,
  );

  const visibleTraces = filteredTraces
    .filter((trace) => traceBuffer.visible.has(trace.traceId))
    .slice(0, traceCount);

  const selectedTrace = useMemo(
    () =>
      selectedTraceId
        ? (allTraces.find((trace) => trace.traceId === selectedTraceId) ?? null)
        : null,
    [allTraces, selectedTraceId],
  );
  const detailOpen = selectedTrace !== null;

  // A Flow Entry's Trace Link arrives as `?trace=…&span=…`; honour the span once.
  useEffect(() => {
    if (requestedSpanId === null || selectedTrace === null) return;
    setDockSettings({ ...dockSettings, selectedSpanId: requestedSpanId });
    void navigate({
      to: '/lotel',
      search: { trace: selectedTrace.traceId, span: undefined },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedSpanId, selectedTrace?.traceId]);

  const traceFlowIds = useMemo(() => {
    const result = new Map<string, string>();
    for (const span of spans) {
      const flowId = span.attributes['flow.id'];
      if (typeof flowId === 'string' && !result.has(span.traceId)) {
        result.set(span.traceId, flowId);
      }
    }
    return result;
  }, [spans]);

  const selectTrace = useCallback(
    (traceId?: string) => {
      void navigate({
        to: '/lotel',
        search: { trace: traceId, span: undefined },
      });
    },
    [navigate],
  );
  const openFlow = useCallback(
    (flowId: string) => {
      void navigate({ to: '/flow', search: { flow: flowId } });
    },
    [navigate],
  );

  const setService = useCallback(
    (service: string) => {
      const withoutService = filters.attributeFilters.filter(
        (filter) => filter.key !== SERVICE_ATTR_KEY,
      );
      setFilters({
        ...filters,
        attributeFilters: service
          ? [
              ...withoutService,
              {
                id: crypto.randomUUID(),
                key: SERVICE_ATTR_KEY,
                value: service,
              },
            ]
          : withoutService,
      });
    },
    [filters, setFilters],
  );

  const onListDividerMouseDown = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      const startX = event.clientX;
      const startWidth = listWidth;
      const move = (next: MouseEvent) =>
        setListWidth(
          Math.min(560, Math.max(280, startWidth + next.clientX - startX)),
        );
      const up = () => {
        document.removeEventListener('mousemove', move);
        document.removeEventListener('mouseup', up);
      };
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
    },
    [listWidth],
  );

  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-2 sm:gap-3 sm:px-4">
        <span className="text-xs text-muted-foreground">
          {`${filteredTraces.length} trace${filteredTraces.length === 1 ? '' : 's'}`}
        </span>
        <div className="ml-auto">
          <Header onClear={onClear} />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside
          style={{ width: listWidth }}
          className={cn(
            'flex shrink-0 flex-col overflow-hidden bg-muted/10 max-md:!w-full',
            detailOpen && 'max-md:hidden',
          )}
        >
          <ListFilters
            query={traceSearch}
            onQueryChange={setTraceSearch}
            filters={filters}
            onFiltersChange={setFilters}
            selectedService={selectedService}
            onServiceChange={setService}
            services={serviceNames}
            attributeKeys={attributeKeys}
            getAttributeValues={getAttributeValues}
            traceListSettings={traceListSettings}
            onTraceListSettingsChange={setTraceListSettings}
          />

          <div className={cn('min-h-0 flex-1 overflow-auto', scrollbarStyles)}>
            <TraceFeed
              traces={visibleTraces}
              allSpans={spans}
              selectedTraceId={selectedTraceId}
              groupBy={traceListSettings.groupBy}
              expandedGroups={traceListSettings.expandedGroups}
              newCount={traceBuffer.pending.size}
              hasMore={
                filteredTraces.length - traceBuffer.pending.size > traceCount
              }
              traceFlowIds={traceFlowIds}
              onRevealNew={() => traceBuffer.reveal()}
              onShowMore={() => setTraceCount((count) => count + PAGE_SIZE)}
              onSelectTrace={(trace) => selectTrace(trace.traceId)}
              onToggleGroup={(name) =>
                setTraceListSettings({
                  ...traceListSettings,
                  expandedGroups: {
                    ...traceListSettings.expandedGroups,
                    [name]: !traceListSettings.expandedGroups[name],
                  },
                })
              }
            />
          </div>
        </aside>

        <div
          className="hidden w-1 shrink-0 cursor-col-resize bg-border transition-colors hover:bg-primary/30 md:block"
          onMouseDown={onListDividerMouseDown}
        />

        <main
          className={cn(
            'min-w-0 flex-1 overflow-hidden',
            detailOpen ? 'max-md:block' : 'max-md:hidden',
          )}
        >
          {selectedTrace ? (
            <TraceWorkspace
              trace={selectedTrace}
              flowId={traceFlowIds.get(selectedTrace.traceId)}
              view={traceView}
              onViewChange={setTraceView}
              settings={dockSettings}
              onSettingsChange={setDockSettings}
              onOpenFlow={openFlow}
              onClose={() => selectTrace()}
            />
          ) : (
            <WorkbenchEmpty kind="Trace" />
          )}
        </main>
      </div>
    </div>
  );
}

function ListFilters({
  query,
  onQueryChange,
  filters,
  onFiltersChange,
  selectedService,
  onServiceChange,
  services,
  attributeKeys,
  getAttributeValues,
  traceListSettings,
  onTraceListSettingsChange,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  filters: ReturnType<typeof useLotelStore.getState>['filters'];
  onFiltersChange: ReturnType<typeof useLotelStore.getState>['setFilters'];
  selectedService: string | null;
  onServiceChange: (value: string) => void;
  services: string[];
  attributeKeys: string[];
  getAttributeValues: (key: string) => string[];
  traceListSettings: ReturnType<typeof useLotelStore.getState>['traceList'];
  onTraceListSettingsChange: ReturnType<
    typeof useLotelStore.getState
  >['setTraceList'];
}) {
  return (
    <div className="flex shrink-0 flex-col gap-2 border-b border-border p-3">
      <label className="flex h-11 items-center gap-2 rounded-md border border-border bg-background px-3 md:h-8 md:px-2">
        <SearchIcon className="size-3.5 text-muted-foreground" />
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search traces"
          className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground md:text-xs"
        />
      </label>
      <>
        <div className="flex min-w-0 items-center gap-1.5">
          <FilterControls
            filters={filters}
            onFiltersChange={onFiltersChange}
            attributeKeys={attributeKeys}
            getAttributeValues={getAttributeValues}
          />
          <GroupByControl
            value={traceListSettings.groupBy}
            onChange={(groupBy) =>
              onTraceListSettingsChange({
                ...traceListSettings,
                groupBy,
              })
            }
            attributeKeys={attributeKeys}
          />
        </div>
        <FilterPills filters={filters} onFiltersChange={onFiltersChange} />
      </>
      <div className="grid grid-cols-2 gap-2">
        <select
          aria-label="Trace status"
          value={filters.status}
          onChange={(event) =>
            onFiltersChange({
              ...filters,
              status: event.target.value as typeof filters.status,
            })
          }
          className="h-11 rounded-md border border-border bg-background px-2 text-base md:h-8 md:text-xs"
        >
          <option value="all">All statuses</option>
          <option value="error">Errors</option>
          <option value="running">Running</option>
        </select>
        <select
          aria-label="Service"
          value={selectedService ?? ''}
          onChange={(event) => onServiceChange(event.target.value)}
          className="h-11 min-w-0 rounded-md border border-border bg-background px-2 text-base md:h-8 md:text-xs"
        >
          <option value="">All services</option>
          {services.map((service) => (
            <option key={service} value={service}>
              {formatServiceName(service)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function WorkbenchEmpty({ kind }: { kind: string }) {
  return (
    <div className="flex h-full items-center justify-center p-8 text-center">
      <div>
        <p className="text-sm font-medium">Select a {kind}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Choose a recent {kind.toLowerCase()} from the list to inspect it.
        </p>
      </div>
    </div>
  );
}

function useBufferedIds(ids: string[], paused: boolean, ready: boolean) {
  const baselineReady = useRef(false);
  const [visible, setVisible] = useState<Set<string>>(() => new Set());
  const signature = ids.join('\u0000');
  const hasVisibleItems = ids.some((id) => visible.has(id));

  useEffect(() => {
    if (!ready) {
      baselineReady.current = false;
      setVisible(new Set(ids));
      return;
    }

    if (!baselineReady.current || !paused || !hasVisibleItems) {
      baselineReady.current = true;
      setVisible(new Set(ids));
    }
  }, [hasVisibleItems, paused, ready, signature]);

  const pending = useMemo(
    () =>
      ready && baselineReady.current && paused && hasVisibleItems
        ? new Set(ids.filter((id) => !visible.has(id)))
        : new Set<string>(),
    [hasVisibleItems, ids, paused, ready, visible],
  );
  const reveal = useCallback(() => setVisible(new Set(ids)), [ids]);
  return { pending, reveal, visible };
}

function joinSpansWithLogs(
  traceItems: ReadonlyArray<SpanRecord & { _meta?: unknown }>,
  logItems: ReadonlyArray<LogRecord & { _meta?: unknown }>,
) {
  const spans = traceItems.map((trace) => transformSpan(trace));
  const logsByKey = new Map<string, OtelEvent[]>();
  for (const log of logItems) {
    if (!log.traceId || !log.spanId) continue;
    const key = `${log.traceId}:${log.spanId}`;
    logsByKey.set(key, [...(logsByKey.get(key) ?? []), transformLog(log)]);
  }
  return spans.map((span) => {
    const logs = logsByKey.get(`${span.traceId}:${span.spanId}`);
    return logs ? attachLogs(span, logs) : span;
  });
}
