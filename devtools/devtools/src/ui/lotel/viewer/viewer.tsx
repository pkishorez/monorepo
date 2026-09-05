import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from '@tanstack/react-db';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { flowAttributePrefix } from '@pkishorez/effect-tracer/flow';
import { makeRecordedFlow, RecordedFlowSchema } from '@pkishorez/lotel/flow';
import { FlowSwimlane } from 'kui-toolkit/components/blocks/flow-swimlane';
import {
  attachLogs,
  groupByTrace,
  transformLog,
  transformSpan,
} from 'kui-toolkit/components/blocks/otel-trace-viewer';
import type {
  OtelEvent,
  OtelSpan,
  TraceGroup,
} from 'kui-toolkit/components/blocks/otel-trace-viewer/trace-model';
import { Button } from 'kui-toolkit/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from 'kui-toolkit/components/ui/dialog';
import { GitBranchIcon, SearchIcon, XIcon } from 'kui-toolkit/lucide';
import { scrollbarStyles } from 'kui-toolkit/lib/scrollStyles';
import { cn } from 'kui-toolkit/lib/utils';
import type { DecodedEntity } from 'std-toolkit/core';
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
import { FlowFeed } from './flow-feed';
import { Header } from './header';
import { TraceFeed } from './trace-feed';
import { TraceWorkspace } from './trace-workspace';

const PAGE_SIZE = 30;

type RecordedFlow = typeof RecordedFlowSchema.Type;
type RecordedFlowItem = RecordedFlow['items'][number];
type FlowStatus = 'active' | 'completed' | 'failed' | 'interrupted' | 'unknown';
type TraceView = 'waterfall' | 'parallel' | 'narrative';
type TelemetryView = 'flows' | 'traces';
type FlowStatusFilter = 'active' | 'all' | 'failed';
type FlowContext = {
  participants: Set<string>;
  services: Set<string>;
  searchText: string;
};

export function Viewer({
  collections,
  onClear,
}: {
  collections: TelemetryCollections;
  onClear: () => Promise<number>;
}) {
  const search = useSearch({ from: '/lotel' });
  const navigate = useNavigate();
  const view: TelemetryView = search.view ?? 'traces';
  const selectedTraceId = search.trace ?? null;
  const selectedFlowId = search.flow ?? null;

  const { data: traceItems, isReady: tracesReady } = useLiveQuery(
    collections.traces,
  );
  const { data: logItems, isReady: logsReady } = useLiveQuery(collections.logs);
  const { data: flowItems, isReady: flowsReady } = useLiveQuery(
    collections.flows,
  );

  const spans = useMemo(
    () => joinSpansWithLogs(traceItems, logItems),
    [traceItems, logItems],
  );
  const allTraces = useMemo(
    () => groupByTrace(spans).sort((a, b) => b.startTime - a.startTime),
    [spans],
  );
  const recordedFlowsById = useMemo(() => {
    const result = new Map<string, RecordedFlow>();
    for (const flow of flowItems) {
      const entity = collectionRowToEntity(flow);
      if (!entity) continue;
      const recorded = makeRecordedFlow(
        entity,
        traceItems.flatMap((span) => {
          if (span.flowId !== flow.flowId) return [];
          const spanEntity = collectionRowToEntity(span);
          return spanEntity ? [spanEntity] : [];
        }),
        logItems.flatMap((log) => {
          if (log.flowId !== flow.flowId) return [];
          const logEntity = collectionRowToEntity(log);
          return logEntity ? [logEntity] : [];
        }),
      );
      result.set(flow.flowId, recorded);
    }
    return result;
  }, [flowItems, logItems, traceItems]);
  const sortedFlows = useMemo(
    () =>
      [...flowItems]
        .map((flow) => ({
          ...flow,
          status: flowStatusOf(recordedFlowsById.get(flow.flowId)),
        }))
        .sort(
          (a, b) =>
            flowTimestamp(b.latestTimeUnixNano) -
            flowTimestamp(a.latestTimeUnixNano),
        ),
    [flowItems, recordedFlowsById],
  );

  const filters = useLotelStore((state) => state.filters);
  const setFilters = useLotelStore((state) => state.setFilters);
  const traceListSettings = useLotelStore((state) => state.traceList);
  const setTraceListSettings = useLotelStore((state) => state.setTraceList);
  const dockSettings = useLotelStore((state) => state.dock);
  const setDockSettings = useLotelStore((state) => state.setDock);

  const [traceSearch, setTraceSearch] = useState('');
  const [flowSearch, setFlowSearch] = useState('');
  const [flowStatus, setFlowStatus] = useState<FlowStatusFilter>('all');
  const [traceView, setTraceView] = useState<TraceView>('waterfall');
  const [selectedFlowItem, setSelectedFlowItem] =
    useState<RecordedFlowItem | null>(null);
  const [listWidth, setListWidth] = useState(360);
  const [traceCount, setTraceCount] = useState(PAGE_SIZE);
  const [flowCount, setFlowCount] = useState(PAGE_SIZE);

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

  const flowContexts = useMemo(() => makeFlowContexts(spans), [spans]);
  const filteredFlows = useMemo(() => {
    const query = flowSearch.trim().toLowerCase();
    return sortedFlows.filter((flow) => {
      const context = flowContexts.get(flow.flowId);
      if (flowStatus === 'active' && flow.status !== 'active') return false;
      if (flowStatus === 'failed' && flow.status !== 'failed') return false;
      if (
        selectedService &&
        !context?.services.has(formatServiceName(selectedService))
      )
        return false;
      if (
        filters.sinceNow !== null &&
        flowTimestamp(flow.latestTimeUnixNano) < filters.sinceNow
      )
        return false;
      if (!query) return true;
      return (
        flow.flowId.toLowerCase().includes(query) ||
        context?.searchText.includes(query) === true
      );
    });
  }, [
    filters.sinceNow,
    flowContexts,
    flowSearch,
    flowStatus,
    selectedService,
    sortedFlows,
  ]);

  const traceBuffer = useBufferedIds(
    filteredTraces.map((trace) => trace.traceId),
    view === 'traces' && selectedTraceId !== null,
    tracesReady,
  );
  const flowBuffer = useBufferedIds(
    filteredFlows.map((flow) => flow.flowId),
    view === 'flows' && selectedFlowId !== null,
    flowsReady,
  );

  const visibleTraces = filteredTraces
    .filter((trace) => traceBuffer.visible.has(trace.traceId))
    .slice(0, traceCount);
  const visibleFlows = filteredFlows
    .filter((flow) => flowBuffer.visible.has(flow.flowId))
    .slice(0, flowCount);

  const selectedTrace = useMemo(
    () =>
      selectedTraceId
        ? (allTraces.find((trace) => trace.traceId === selectedTraceId) ?? null)
        : null,
    [allTraces, selectedTraceId],
  );
  const selectedFlow = selectedFlowId
    ? (recordedFlowsById.get(selectedFlowId) ?? null)
    : null;

  useEffect(() => setSelectedFlowItem(null), [selectedFlowId]);

  const selectedActivity =
    selectedFlowItem?.kind === 'activity' ? selectedFlowItem : null;
  const selectedLog = useMemo(() => {
    if (!selectedFlowItem || selectedFlowItem.kind === 'activity') return null;
    return logItems.find((item) => item.id === selectedFlowItem.id) ?? null;
  }, [logItems, selectedFlowItem]);
  const selectedLogEvent = useMemo(
    () => (selectedLog ? transformLog(selectedLog) : null),
    [selectedLog],
  );

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

  const selectedActivitySpan = useMemo(
    () =>
      selectedActivity
        ? (spans.find(
            (span) =>
              span.traceId === selectedActivity.traceId &&
              span.spanId === selectedActivity.spanId,
          ) ?? null)
        : null,
    [selectedActivity, spans],
  );
  const selectedActivityRecord = useMemo(
    () =>
      selectedActivity
        ? (traceItems.find(
            (span) =>
              span.traceId === selectedActivity.traceId &&
              span.spanId === selectedActivity.spanId,
          ) ?? null)
        : null,
    [selectedActivity, traceItems],
  );
  const selectedActivityTrace = useMemo(
    () =>
      selectedActivity
        ? (allTraces.find(
            (trace) => trace.traceId === selectedActivity.traceId,
          ) ?? null)
        : null,
    [allTraces, selectedActivity],
  );

  const setView = useCallback(
    (next: TelemetryView) => {
      void navigate({
        to: '/lotel',
        search: (previous) => ({
          view: next,
          trace: previous.trace,
          flow: previous.flow,
        }),
      });
    },
    [navigate],
  );
  const selectTrace = useCallback(
    (traceId?: string) => {
      void navigate({
        to: '/lotel',
        search: (previous) => ({
          view: 'traces' as const,
          trace: traceId,
          flow: previous.flow,
        }),
      });
    },
    [navigate],
  );
  const selectFlow = useCallback(
    (flowId?: string) => {
      void navigate({
        to: '/lotel',
        search: (previous) => ({
          view: 'flows' as const,
          flow: flowId,
          trace: previous.trace,
        }),
      });
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
      <div className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-4">
        <div className="flex items-center rounded-md bg-muted/50 p-0.5">
          <ViewTab active={view === 'traces'} onClick={() => setView('traces')}>
            Traces
          </ViewTab>
          <ViewTab active={view === 'flows'} onClick={() => setView('flows')}>
            Flows
          </ViewTab>
        </div>
        <span className="text-xs text-muted-foreground">
          {view === 'traces'
            ? `${filteredTraces.length} trace${filteredTraces.length === 1 ? '' : 's'}`
            : `${filteredFlows.length} flow${filteredFlows.length === 1 ? '' : 's'}`}
        </span>
        <div className="ml-auto">
          <Header onClear={onClear} />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside
          style={{ width: listWidth }}
          className="flex shrink-0 flex-col overflow-hidden bg-muted/10"
        >
          <ListFilters
            view={view}
            query={view === 'traces' ? traceSearch : flowSearch}
            onQueryChange={view === 'traces' ? setTraceSearch : setFlowSearch}
            filters={filters}
            onFiltersChange={setFilters}
            flowStatus={flowStatus}
            onFlowStatusChange={setFlowStatus}
            selectedService={selectedService}
            onServiceChange={setService}
            services={serviceNames}
            attributeKeys={attributeKeys}
            getAttributeValues={getAttributeValues}
            traceListSettings={traceListSettings}
            onTraceListSettingsChange={setTraceListSettings}
          />

          <div className={cn('min-h-0 flex-1 overflow-auto', scrollbarStyles)}>
            {view === 'traces' ? (
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
            ) : (
              <FlowFeed
                flows={visibleFlows}
                contexts={flowContexts}
                selectedFlowId={selectedFlowId}
                newCount={flowBuffer.pending.size}
                hasMore={
                  filteredFlows.length - flowBuffer.pending.size > flowCount
                }
                onRevealNew={() => flowBuffer.reveal()}
                onShowMore={() => setFlowCount((count) => count + PAGE_SIZE)}
                onSelectFlow={(flowId) => selectFlow(flowId)}
              />
            )}
          </div>
        </aside>

        <div
          className="w-1 shrink-0 cursor-col-resize bg-border transition-colors hover:bg-primary/30"
          onMouseDown={onListDividerMouseDown}
        />

        <main className="min-w-0 flex-1 overflow-hidden">
          {view === 'traces' ? (
            selectedTrace ? (
              <TraceWorkspace
                trace={selectedTrace}
                flowId={traceFlowIds.get(selectedTrace.traceId)}
                view={traceView}
                onViewChange={setTraceView}
                settings={dockSettings}
                onSettingsChange={setDockSettings}
                onOpenFlow={selectFlow}
                onClose={() => selectTrace()}
              />
            ) : (
              <WorkbenchEmpty kind="Trace" />
            )
          ) : selectedFlowId ? (
            <FlowWorkspace
              flow={selectedFlow}
              loading={!flowsReady || !logsReady || !tracesReady}
              failed={false}
              item={selectedFlowItem}
              activityRecord={selectedActivityRecord}
              activitySpan={selectedActivitySpan}
              activityTrace={selectedActivityTrace}
              logEvent={selectedLogEvent}
              logRecord={selectedLog}
              onItemSelect={setSelectedFlowItem}
              traceView={traceView}
              onTraceViewChange={setTraceView}
              settings={dockSettings}
              onSettingsChange={setDockSettings}
              onClose={() => selectFlow()}
            />
          ) : (
            <WorkbenchEmpty kind="Flow" />
          )}
        </main>
      </div>
    </div>
  );
}

function ViewTab({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        'rounded px-3 py-1 text-xs font-medium text-muted-foreground transition-colors',
        active && 'bg-background text-foreground shadow-sm',
      )}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function ListFilters({
  view,
  query,
  onQueryChange,
  filters,
  onFiltersChange,
  flowStatus,
  onFlowStatusChange,
  selectedService,
  onServiceChange,
  services,
  attributeKeys,
  getAttributeValues,
  traceListSettings,
  onTraceListSettingsChange,
}: {
  view: TelemetryView;
  query: string;
  onQueryChange: (value: string) => void;
  filters: ReturnType<typeof useLotelStore.getState>['filters'];
  onFiltersChange: ReturnType<typeof useLotelStore.getState>['setFilters'];
  flowStatus: FlowStatusFilter;
  onFlowStatusChange: (value: FlowStatusFilter) => void;
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
      <label className="flex h-8 items-center gap-2 rounded-md border border-border bg-background px-2">
        <SearchIcon className="size-3.5 text-muted-foreground" />
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={`Search ${view}`}
          className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
        />
      </label>
      {view === 'traces' ? (
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
      ) : (
        <Button
          variant={filters.sinceNow === null ? 'outline' : 'default'}
          size="xs"
          className="self-start"
          onClick={() =>
            onFiltersChange({
              ...filters,
              sinceNow: filters.sinceNow === null ? Date.now() : null,
            })
          }
        >
          {filters.sinceNow === null ? 'Since now' : 'Clear since now'}
        </Button>
      )}
      <div className="grid grid-cols-2 gap-2">
        {view === 'traces' ? (
          <select
            aria-label="Trace status"
            value={filters.status}
            onChange={(event) =>
              onFiltersChange({
                ...filters,
                status: event.target.value as typeof filters.status,
              })
            }
            className="h-8 rounded-md border border-border bg-background px-2 text-xs"
          >
            <option value="all">All statuses</option>
            <option value="error">Errors</option>
            <option value="running">Running</option>
          </select>
        ) : (
          <select
            aria-label="Flow status"
            value={flowStatus}
            onChange={(event) =>
              onFlowStatusChange(event.target.value as FlowStatusFilter)
            }
            className="h-8 rounded-md border border-border bg-background px-2 text-xs"
          >
            <option value="all">All statuses</option>
            <option value="failed">Failed</option>
            <option value="active">Active</option>
          </select>
        )}
        <select
          aria-label="Service"
          value={selectedService ?? ''}
          onChange={(event) => onServiceChange(event.target.value)}
          className="h-8 min-w-0 rounded-md border border-border bg-background px-2 text-xs"
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

function FlowWorkspace({
  flow,
  loading,
  failed,
  item,
  activityRecord,
  activitySpan,
  activityTrace,
  logEvent,
  logRecord,
  onItemSelect,
  traceView,
  onTraceViewChange,
  settings,
  onSettingsChange,
  onClose,
}: {
  flow: RecordedFlow | null;
  loading: boolean;
  failed: boolean;
  item: RecordedFlowItem | null;
  activityRecord: SpanRecord | null;
  activitySpan: OtelSpan | null;
  activityTrace: TraceGroup | null;
  logEvent: OtelEvent | null;
  logRecord: LogRecord | null;
  onItemSelect: (item: RecordedFlowItem | null) => void;
  traceView: TraceView;
  onTraceViewChange: (view: TraceView) => void;
  settings: ReturnType<typeof useLotelStore.getState>['dock'];
  onSettingsChange: ReturnType<typeof useLotelStore.getState>['setDock'];
  onClose: () => void;
}) {
  const [traceDialogOpen, setTraceDialogOpen] = useState(false);

  useEffect(() => setTraceDialogOpen(false), [flow?.id]);

  if (loading) return <CenteredMessage>Loading Flow…</CenteredMessage>;
  if (failed || !flow)
    return <CenteredMessage>Could not load this Flow.</CenteredMessage>;
  const status = flowStatusOf(flow);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex h-11 shrink-0 items-center gap-3 border-b border-border px-4">
        <FlowStatusDot status={status} />
        <GitBranchIcon className="size-4 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate font-mono text-sm font-medium">
          {flow.id}
        </span>
        <span className="text-xs capitalize text-muted-foreground">
          {status} · {flow.items.length} item
          {flow.items.length === 1 ? '' : 's'}
        </span>
        <Button variant="ghost" size="icon-sm" onClick={onClose}>
          <XIcon className="size-4" />
          <span className="sr-only">Close Flow</span>
        </Button>
      </div>
      {flow.warnings.length > 0 && (
        <div className="shrink-0 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-800 dark:text-amber-300">
          {flow.warnings.length} invalid Flow record
          {flow.warnings.length === 1 ? '' : 's'} omitted
        </div>
      )}
      <div className="flex min-h-0 flex-1 overflow-hidden max-[900px]:flex-col">
        <div
          className={cn('min-w-0 flex-1 overflow-auto p-4', scrollbarStyles)}
        >
          <FlowSwimlane
            flow={
              flow as unknown as React.ComponentProps<
                typeof FlowSwimlane
              >['flow']
            }
            selectedItemId={item?.id}
            onItemClick={onItemSelect}
          />
        </div>
        {item && (
          <div className="w-[380px] shrink-0 overflow-auto border-l border-border max-[900px]:max-h-[45%] max-[900px]:w-full max-[900px]:border-l-0 max-[900px]:border-t">
            <div className="flex items-center justify-between border-b border-border px-4 py-2">
              <span className="truncate text-xs text-muted-foreground">
                {item.participantName}
              </span>
              <div className="flex items-center gap-1">
                {item.kind === 'activity' && (
                  <Button
                    size="xs"
                    variant="outline"
                    disabled={!activityTrace}
                    onClick={() => setTraceDialogOpen(true)}
                  >
                    Open Trace
                  </Button>
                )}
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Close item details"
                  onClick={() => onItemSelect(null)}
                >
                  <XIcon className="size-4" />
                </Button>
              </div>
            </div>
            {item.kind !== 'activity' && logEvent && logRecord ? (
              <FlowLogDetail
                event={logEvent}
                name={item.name}
                record={logRecord}
              />
            ) : activitySpan && activityRecord ? (
              <FlowSpanDetail span={activitySpan} record={activityRecord} />
            ) : (
              <div className="p-6 text-sm text-muted-foreground">
                {item.kind === 'activity'
                  ? 'Span details are not loaded. Open the Trace to inspect it.'
                  : 'Log details are not loaded.'}
              </div>
            )}
          </div>
        )}
      </div>
      <Dialog open={traceDialogOpen} onOpenChange={setTraceDialogOpen}>
        <DialogContent
          showCloseButton={false}
          className="block h-[88vh] w-[min(1440px,95vw)] max-w-none overflow-hidden p-0 sm:max-w-none"
        >
          <DialogTitle className="sr-only">
            {activityTrace ? `Trace ${activityTrace.name}` : 'Trace'}
          </DialogTitle>
          {activityTrace && (
            <TraceWorkspace
              trace={activityTrace}
              view={traceView}
              onViewChange={onTraceViewChange}
              settings={settings}
              onSettingsChange={onSettingsChange}
              onClose={() => setTraceDialogOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FlowLogDetail({
  event,
  name,
  record,
}: {
  event: OtelEvent;
  name: string;
  record: LogRecord;
}) {
  const body = event.attributes.body;
  const directKeys = (record.log.attributes ?? []).flatMap((attribute) =>
    attribute.key ? [attribute.key] : [],
  );
  const applicationAttributes = primaryAttributeEntries(
    directKeys,
    event.attributes,
  );
  const flowAttributes = prefixedAttributeEntries(
    directKeys,
    event.attributes,
    'flow.',
  );
  const resourceAttributes = prefixedAttributeEntries(
    Object.keys(event.attributes),
    event.attributes,
    'resource.',
  );
  const scopeAttributes = prefixedAttributeEntries(
    Object.keys(event.attributes),
    event.attributes,
    'scope.',
  );
  const logMetadata = [
    ['severityText', event.attributes.severityText],
    ['severityNumber', event.attributes.severityNumber],
    ['flags', record.log.flags],
    ['droppedAttributesCount', record.log.droppedAttributesCount],
  ].filter((entry): entry is [string, unknown] => entry[1] !== undefined);
  const traceContext = [
    ['traceId', record.traceId],
    ['spanId', record.spanId],
  ].filter((entry): entry is [string, string] => entry[1] !== null);

  return (
    <div className="space-y-5 p-4">
      <div>
        <p className="break-words font-mono text-sm font-medium">{name}</p>
        <p className="mt-1 font-mono text-[10px] text-muted-foreground">
          {new Date(event.timestamp).toISOString()}
        </p>
      </div>

      <FlowDetailSection label="Body">
        <div className="rounded-md bg-muted/35 px-3 py-3 font-mono text-xs text-foreground/90">
          {formatAttributeValue(body ?? event.name)}
        </div>
      </FlowDetailSection>

      <FlowPrimaryAttributes entries={applicationAttributes} />

      <FlowTelemetryContext
        groups={[
          { label: 'Flow', entries: flowAttributes },
          { label: 'Trace', entries: traceContext },
          { label: 'Resource', entries: resourceAttributes },
          { label: 'Scope', entries: scopeAttributes },
          { label: 'Log', entries: logMetadata },
        ]}
      />
    </div>
  );
}

function FlowSpanDetail({
  record,
  span,
}: {
  record: SpanRecord;
  span: OtelSpan;
}) {
  const directKeys = (record.span.attributes ?? []).flatMap((attribute) =>
    attribute.key ? [attribute.key] : [],
  );
  const applicationAttributes = primaryAttributeEntries(
    directKeys,
    span.attributes,
  );
  const flowAttributes = prefixedAttributeEntries(
    directKeys,
    span.attributes,
    'flow.',
  );
  const resourceAttributes = prefixedAttributeEntries(
    Object.keys(span.attributes),
    span.attributes,
    'resource.',
  );
  const scopeAttributes = prefixedAttributeEntries(
    Object.keys(span.attributes),
    span.attributes,
    'scope.',
  );
  const traceContext = [
    ['traceId', span.traceId],
    ['spanId', span.spanId],
    ['parentSpanId', span.parentSpanId],
  ].filter((entry): entry is [string, string] => entry[1] !== null);
  const spanMetadata: AttributeEntry[] = [
    ...(record.span.kind === undefined
      ? []
      : ([['kind', record.span.kind]] as const)),
    ...(record.span.droppedAttributesCount === undefined
      ? []
      : ([
          ['droppedAttributesCount', record.span.droppedAttributesCount],
        ] as const)),
  ];

  return (
    <div className="space-y-5 p-4">
      <div>
        <p className="break-words font-mono text-sm font-medium">{span.name}</p>
        <p className="mt-1 text-[10px] capitalize text-muted-foreground">
          {span.status} ·{' '}
          {formatDuration(
            span.endTime === null ? null : span.endTime - span.startTime,
          )}
        </p>
      </div>

      <FlowPrimaryAttributes entries={applicationAttributes} />

      <FlowTelemetryContext
        groups={[
          { label: 'Flow', entries: flowAttributes },
          { label: 'Trace', entries: traceContext },
          { label: 'Resource', entries: resourceAttributes },
          { label: 'Scope', entries: scopeAttributes },
          { label: 'Span', entries: spanMetadata },
        ]}
      />
    </div>
  );
}

type AttributeEntry = readonly [string, unknown];

function primaryAttributeEntries(
  keys: readonly string[],
  attributes: Readonly<Record<string, unknown>>,
): AttributeEntry[] {
  const ranked = [...new Set(keys)]
    .filter((key) => !key.startsWith('flow.'))
    .map((key) => ({
      label: key.startsWith(flowAttributePrefix)
        ? key.slice(flowAttributePrefix.length)
        : key,
      namespaced: key.startsWith(flowAttributePrefix),
      value: attributes[key],
    }))
    .sort((left, right) => Number(right.namespaced) - Number(left.namespaced));
  const seen = new Set<string>();
  return ranked.flatMap(({ label, value }) => {
    if (seen.has(label)) return [];
    seen.add(label);
    return [[label, value] as const];
  });
}

function prefixedAttributeEntries(
  keys: readonly string[],
  attributes: Readonly<Record<string, unknown>>,
  prefix: string,
): AttributeEntry[] {
  return [...new Set(keys)]
    .filter((key) => key.startsWith(prefix))
    .map((key) => [key, attributes[key]] as const);
}

function FlowPrimaryAttributes({ entries }: { entries: AttributeEntry[] }) {
  return (
    <FlowDetailSection label="Attributes">
      {entries.length > 0 ? (
        <dl className="divide-y divide-border/40 overflow-hidden rounded-md border border-border/50">
          {entries.map(([key, value]) => (
            <FlowAttribute key={key} label={key} value={value} />
          ))}
        </dl>
      ) : (
        <p className="text-xs text-muted-foreground">No attributes.</p>
      )}
    </FlowDetailSection>
  );
}

function FlowDetailSection({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <section>
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      {children}
    </section>
  );
}

function FlowTelemetryContext({
  groups,
}: {
  groups: ReadonlyArray<{ label: string; entries: AttributeEntry[] }>;
}) {
  const visibleGroups = groups.filter(({ entries }) => entries.length > 0);
  const count = visibleGroups.reduce(
    (total, { entries }) => total + entries.length,
    0,
  );
  if (count === 0) return null;

  return (
    <details className="group overflow-hidden rounded-md border border-border/60 bg-muted/15">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 text-xs text-muted-foreground hover:bg-muted/25 hover:text-foreground">
        <span>Context</span>
        <span className="font-mono text-[10px]">{count}</span>
      </summary>
      <div className="space-y-5 border-t border-border/50 p-3">
        {visibleGroups.map(({ entries, label }) => (
          <FlowDetailSection key={label} label={label}>
            <dl className="divide-y divide-border/40">
              {entries.map(([key, value]) => (
                <FlowAttribute key={key} label={key} value={value} />
              ))}
            </dl>
          </FlowDetailSection>
        ))}
      </div>
    </details>
  );
}

function FlowAttribute({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="px-3 py-2.5">
      <dt className="mb-1 break-all font-mono text-[10px] text-muted-foreground">
        {label}
      </dt>
      <dd className="whitespace-pre-wrap break-words font-mono text-[11px] text-foreground/85">
        {formatAttributeValue(value)}
      </dd>
    </div>
  );
}

function formatAttributeValue(value: unknown) {
  if (typeof value === 'string') return value;
  if (value === undefined) return 'undefined';
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}

function FlowStatusDot({ status }: { status: string }) {
  return (
    <span
      className={cn(
        'size-2 shrink-0 rounded-full',
        status === 'failed' && 'bg-destructive',
        status === 'active' && 'animate-pulse bg-amber-500',
        status === 'completed' && 'bg-emerald-600',
        (status === 'interrupted' || status === 'unknown') &&
          'bg-muted-foreground',
      )}
    />
  );
}

function flowStatusOf(flow: RecordedFlow | undefined): FlowStatus {
  if (!flow) return 'unknown';
  if (flow.activations.some((activation) => activation.outcome === 'failed'))
    return 'failed';
  if (flow.activations.some((activation) => activation.outcome === null))
    return 'active';
  if (
    flow.activations.some((activation) => activation.outcome === 'interrupted')
  )
    return 'interrupted';
  return 'completed';
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

function CenteredMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

function formatDuration(milliseconds: number | null) {
  if (milliseconds === null) return 'running';
  if (milliseconds < 1) return '<1ms';
  if (milliseconds < 1_000) return `${Math.round(milliseconds)}ms`;
  return `${(milliseconds / 1_000).toFixed(2)}s`;
}

function flowTimestamp(nanoseconds: string) {
  try {
    return Number(BigInt(nanoseconds) / 1_000_000n);
  } catch {
    return 0;
  }
}

function makeFlowContexts(spans: OtelSpan[]) {
  const contexts = new Map<string, FlowContext>();
  for (const span of spans) {
    const flowId = span.attributes['flow.id'];
    if (typeof flowId !== 'string') continue;
    let context = contexts.get(flowId);
    if (!context) {
      context = {
        participants: new Set(),
        services: new Set(),
        searchText: '',
      };
      contexts.set(flowId, context);
    }
    const participant = span.attributes['flow.participant.name'];
    const service = span.attributes[SERVICE_ATTR_KEY];
    if (typeof participant === 'string') context.participants.add(participant);
    if (typeof service === 'string') context.services.add(service);
    context.searchText += ` ${span.name.toLowerCase()} ${String(participant ?? '').toLowerCase()} ${String(service ?? '').toLowerCase()}`;
  }
  return contexts;
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

function collectionRowToEntity<T extends object>(
  row: T & { _meta?: DecodedEntity<T>['meta'] },
): DecodedEntity<T> | null {
  const { _meta, ...value } = row;
  return _meta ? { value: value as T, meta: _meta } : null;
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
