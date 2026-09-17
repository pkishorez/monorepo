import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from '@tanstack/react-db';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { Effect, Schema } from 'effect';
import {
  fromJournalFile,
  groupJournals,
  JournalFileSchema,
  mergeJournals,
  projectJournal,
  toJournalFile,
  type Entry,
  type FlowStatus,
  type Journal,
  type Projection,
} from '@pkishorez/flow';
import {
  FlowItemDetails,
  FlowSwimlane,
} from 'kui-toolkit/components/blocks/flow-swimlane';
import {
  attachLogs,
  TraceViewer,
  transformLog,
  transformSpan,
} from 'kui-toolkit/components/blocks/otel-trace-viewer';
import type { OtelSpan } from 'kui-toolkit/components/blocks/otel-trace-viewer/trace-model';
import { Button } from 'kui-toolkit/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from 'kui-toolkit/components/ui/dialog';
import { toast } from 'kui-toolkit/components/ui/sonner';
import {
  DownloadIcon,
  GitBranchIcon,
  SearchIcon,
  UploadIcon,
  XIcon,
} from 'kui-toolkit/lucide';
import { scrollbarStyles } from 'kui-toolkit/lib/scrollStyles';
import { cn } from 'kui-toolkit/lib/utils';
import {
  DevtoolsClient,
  useDevtoolsRuntime,
} from '../../../client/devtools-rpc/index.js';
import type { FlowCollections } from '../collections';
import { FlowFeed, FlowStatusDot, type FlowFeedRow } from './flow-feed';
import { Header } from './header';

const PAGE_SIZE = 30;

type StatusFilter = 'all' | 'active' | 'failed';
type ProjectionItem = Projection['items'][number];
type TraceTarget = { readonly traceId: string; readonly spanId: string };
type LoadedTrace =
  | { readonly state: 'loading'; readonly target: TraceTarget }
  | { readonly state: 'missing'; readonly target: TraceTarget }
  | {
      readonly state: 'ready';
      readonly target: TraceTarget;
      readonly spans: readonly OtelSpan[];
    };

export function Viewer({
  collections,
  onClear,
}: {
  collections: FlowCollections;
  onClear: () => Promise<number>;
}) {
  const search = useSearch({ from: '/flow' });
  const navigate = useNavigate();
  const runtime = useDevtoolsRuntime();
  const selectedFlowId = search.flow ?? null;
  const [trace, setTrace] = useState<LoadedTrace | null>(null);

  const { data: rows, isReady } = useLiveQuery(collections.entries);

  // Rows arrive in `_u` order from the store; that order is the Journal order.
  const projections = useMemo(() => {
    const ordered = [...rows].sort((a, b) =>
      a._meta && b._meta ? a._meta._u.localeCompare(b._meta._u) : 0,
    );
    const journals = groupJournals(ordered.map((row) => row.entry as Entry));
    return new Map(
      [...journals].map(([id, journal]) => [id, projectJournal(journal)]),
    );
  }, [rows]);

  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [count, setCount] = useState(PAGE_SIZE);
  const [selectedItem, setSelectedItem] = useState<ProjectionItem | null>(null);
  const [merged, setMerged] = useState<Projection | null>(null);
  const [listWidth, setListWidth] = useState(360);
  const fileInput = useRef<HTMLInputElement>(null);

  const feed = useMemo<FlowFeedRow[]>(() => {
    const needle = query.trim().toLowerCase();
    return [...projections.values()]
      .filter((projection) => {
        if (status === 'active' && projection.status !== 'active') return false;
        if (status === 'failed' && projection.status !== 'failed') return false;
        if (!needle) return true;
        return (
          projection.id.toLowerCase().includes(needle) ||
          projection.participants.some((name) =>
            name.toLowerCase().includes(needle),
          ) ||
          projection.items.some((item) =>
            item.name.toLowerCase().includes(needle),
          )
        );
      })
      .sort((a, b) => b.latestTimestamp - a.latestTimestamp)
      .map((projection) => ({
        id: projection.id,
        status: projection.status,
        latestTimestamp: projection.latestTimestamp,
        participants: projection.participants,
        entryCount: projection.items.length,
      }));
  }, [projections, query, status]);

  const selected = selectedFlowId
    ? (projections.get(selectedFlowId) ?? null)
    : null;

  useEffect(() => setSelectedItem(null), [selectedFlowId]);

  const selectFlow = useCallback(
    (flowId?: string) => {
      void navigate({ to: '/flow', search: { flow: flowId } });
    },
    [navigate],
  );

  // The trace lives in Lotel's store; show it here rather than leaving the Flow.
  const openTrace = useCallback(
    (target: TraceTarget) => {
      setTrace({ state: 'loading', target });
      runtime
        .runPromise(
          Effect.gen(function* () {
            const client = yield* DevtoolsClient;
            return yield* client.GetTrace({ traceId: target.traceId });
          }),
        )
        .then(
          (details) => {
            const logsBySpan = new Map<
              string,
              ReturnType<typeof transformLog>[]
            >();
            for (const log of details.logs) {
              if (!log.value.spanId) continue;
              const key = log.value.spanId;
              logsBySpan.set(key, [
                ...(logsBySpan.get(key) ?? []),
                transformLog(log.value),
              ]);
            }
            const spans = details.spans.map((span) => {
              const transformed = transformSpan(span.value);
              const logs = logsBySpan.get(transformed.spanId);
              return logs ? attachLogs(transformed, logs) : transformed;
            });
            setTrace({ state: 'ready', target, spans });
          },
          () => setTrace({ state: 'missing', target }),
        );
    },
    [runtime],
  );

  const exportJournal = useCallback((projection: Projection) => {
    const journal: Journal = {
      flowId: projection.id,
      entries: projection.items,
      ordering: projection.ordering,
    };
    const blob = new Blob([JSON.stringify(toJournalFile(journal), null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${projection.id.replaceAll(/[^\w.-]+/g, '_')}.flow.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, []);

  const importJournals = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    try {
      const decoded = await Promise.all(
        [...files].map(async (file) =>
          fromJournalFile(
            Schema.decodeUnknownSync(JournalFileSchema)(
              JSON.parse(await file.text()),
            ),
          ),
        ),
      );
      const projection = projectJournal(mergeJournals(decoded));
      setMerged(projection);
      toast.success(
        `Merged ${decoded.length} journal${decoded.length === 1 ? '' : 's'} into ${projection.items.length} entries`,
      );
    } catch (cause) {
      toast.error('Could not read the journal file', {
        description: cause instanceof Error ? cause.message : String(cause),
      });
    }
  }, []);

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

  const detailOpen = selectedFlowId !== null;

  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-2 sm:gap-3 sm:px-4">
        <span className="text-xs text-muted-foreground">
          {feed.length} flow{feed.length === 1 ? '' : 's'}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            multiple
            className="hidden"
            onChange={(event) => {
              void importJournals(event.target.files);
              event.target.value = '';
            }}
          />
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Import and merge journals"
            title="Import and merge journals"
            onClick={() => fileInput.current?.click()}
          >
            <UploadIcon className="size-4" />
          </Button>
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
          <div className="flex shrink-0 flex-col gap-2 border-b border-border p-3">
            <label className="flex h-11 items-center gap-2 rounded-md border border-border bg-background px-3 md:h-8 md:px-2">
              <SearchIcon className="size-3.5 text-muted-foreground" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search flows"
                className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground md:text-xs"
              />
            </label>
            <select
              aria-label="Flow status"
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as StatusFilter)
              }
              className="h-11 rounded-md border border-border bg-background px-2 text-base md:h-8 md:text-xs"
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="failed">Failed</option>
            </select>
          </div>
          <div className={cn('min-h-0 flex-1 overflow-auto', scrollbarStyles)}>
            {!isReady ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                Loading flows…
              </div>
            ) : (
              <>
                <FlowFeed
                  flows={feed.slice(0, count)}
                  selectedFlowId={selectedFlowId}
                  onSelectFlow={selectFlow}
                />
                {feed.length > count && (
                  <button
                    type="button"
                    onClick={() => setCount((value) => value + PAGE_SIZE)}
                    className="w-full px-3 py-3 text-xs text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                  >
                    Show more
                  </button>
                )}
              </>
            )}
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
          {selectedFlowId ? (
            <FlowWorkspace
              flow={selected}
              loading={!isReady}
              item={selectedItem}
              onItemSelect={setSelectedItem}
              onOpenTrace={openTrace}
              onExport={exportJournal}
              onClose={() => selectFlow()}
            />
          ) : (
            <div className="flex h-full items-center justify-center p-8 text-center">
              <div>
                <p className="text-sm font-medium">Select a Flow</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Choose a recent flow from the list to inspect it.
                </p>
              </div>
            </div>
          )}
        </main>
      </div>
      <Dialog
        open={trace !== null}
        onOpenChange={(open) => !open && setTrace(null)}
      >
        <DialogContent
          showCloseButton={false}
          className="flex h-[88vh] w-[min(1440px,95vw)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none"
        >
          <DialogTitle className="sr-only">Trace</DialogTitle>
          {trace?.state === 'ready' ? (
            <TraceViewer
              spans={trace.spans}
              initialSelectedSpanId={trace.target.spanId}
              onClose={() => setTrace(null)}
              className="h-full rounded-none border-0"
              emptyMessage="This trace has no spans."
            />
          ) : (
            <CenteredMessage>
              {trace?.state === 'loading'
                ? 'Loading trace…'
                : 'This trace is not in Lotel. Was the program exporting traces to DevTools?'}
            </CenteredMessage>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={merged !== null}
        onOpenChange={(open) => !open && setMerged(null)}
      >
        <DialogContent
          showCloseButton={false}
          className="flex h-[88vh] w-[min(1440px,95vw)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none"
        >
          <DialogTitle className="sr-only">Merged journal</DialogTitle>
          {merged && (
            <FlowWorkspace
              flow={merged}
              loading={false}
              item={null}
              onItemSelect={() => undefined}
              onOpenTrace={openTrace}
              onExport={exportJournal}
              onClose={() => setMerged(null)}
              title="Merged journal (clock ordered, not stored)"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FlowWorkspace({
  flow,
  loading,
  item,
  onItemSelect,
  onOpenTrace,
  onExport,
  onClose,
  title,
}: {
  flow: Projection | null;
  loading: boolean;
  item: ProjectionItem | null;
  onItemSelect: (item: ProjectionItem | null) => void;
  onOpenTrace: (target: { traceId: string; spanId: string }) => void;
  onExport: (flow: Projection) => void;
  onClose: () => void;
  title?: string;
}) {
  const [localItem, setLocalItem] = useState<ProjectionItem | null>(null);
  const selectedItem = item ?? localItem;
  const select = (next: ProjectionItem | null) => {
    setLocalItem(next);
    onItemSelect(next);
  };

  if (loading) return <CenteredMessage>Loading Flow…</CenteredMessage>;
  if (!flow)
    return <CenteredMessage>Could not load this Flow.</CenteredMessage>;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-2 sm:h-11 sm:gap-3 sm:px-4">
        <FlowStatusDot status={flow.status} />
        <GitBranchIcon className="size-4 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate font-mono text-sm font-medium">
          {title ?? flow.id}
        </span>
        <span className="hidden text-xs capitalize text-muted-foreground sm:inline">
          {statusLabel(flow.status)} · {flow.items.length} entr
          {flow.items.length === 1 ? 'y' : 'ies'}
          {flow.ordering === 'clock' ? ' · clock ordered' : ''}
          {flow.warnings.length > 0 && (
            <>
              {' · '}
              <span className="normal-case text-destructive">
                {flow.warnings.length} warning
                {flow.warnings.length === 1 ? '' : 's'}
              </span>
            </>
          )}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Export journal"
          title="Export journal"
          onClick={() => onExport(flow)}
        >
          <DownloadIcon className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          className="size-10 sm:size-8"
          aria-label="Back to flows"
          onClick={onClose}
        >
          <XIcon className="size-4" />
          <span className="sr-only">Close Flow</span>
        </Button>
      </div>
      <div className="flex min-h-0 flex-1 overflow-hidden max-[900px]:flex-col">
        <div className="min-w-0 flex-1 overflow-hidden">
          <FlowSwimlane
            flow={flow}
            className="h-full"
            selectedItemId={selectedItem?.id ?? null}
            onSelectionChange={select}
          />
        </div>
        {selectedItem && (
          <div className="w-[380px] shrink-0 overflow-auto border-l border-border max-[900px]:max-h-[45%] max-[900px]:w-full max-[900px]:border-l-0 max-[900px]:border-t">
            <FlowItemDetails
              item={selectedItem}
              flow={flow}
              onClose={() => select(null)}
              onOpenTrace={onOpenTrace}
            />
          </div>
        )}
      </div>
    </div>
  );
}

const statusLabel = (status: FlowStatus) =>
  status === 'quiet' ? 'quiet' : status;

function CenteredMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}
