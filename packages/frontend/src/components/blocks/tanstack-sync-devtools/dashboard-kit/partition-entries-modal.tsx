import { useMemo, useState } from 'react';
import { useLiveQuery, eq } from '@tanstack/react-db';
import { ScrollArea } from '#components/ui/scroll-area';
import { Badge } from '#components/ui/badge';
import { Button } from '#components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '#components/ui/dialog';
import { ChevronLeftIcon, ChevronRightIcon } from '#lib/lucide';
import type { Collection } from '@tanstack/react-db';
import type { CadenceConfig } from 'std-toolkit/tanstack-sync';
import type { InspectorData, InspectorPartition } from '../view-model';
import { JsonGlassViewer } from './json-glass-viewer';
import { SliceViz, STRATEGY_META } from './slice-viz';

const PAGE_SIZE = 25;

function updatedAt(row: unknown): string {
  const u = (row as { _meta?: { _u?: unknown } })._meta?._u;
  return typeof u === 'string' ? u : '';
}

function entityId(value: unknown): string {
  if (value == null || typeof value !== 'object') return '—';
  const fields = value as Record<string, unknown>;
  const raw = fields.id ?? fields.code;
  return typeof raw === 'string' || typeof raw === 'number' ? String(raw) : '—';
}

/** Stability-window age of a record: server-settled (`_s`) minus update key (`_u`). */
function cadenceValue(row: unknown): number | null {
  const meta = (row as { _meta?: { _u?: unknown; _s?: unknown } })._meta;
  if (typeof meta?._s !== 'number' || typeof meta._u !== 'string') return null;
  const u = Date.parse(meta._u);
  return Number.isNaN(u) ? null : meta._s - u;
}

/** Human-readable duration in a single rounded unit: ms → s → min → hr → d. */
function formatCadence(ms: number): string {
  if (ms < 1_000) return `${ms} ms`;
  if (ms < 60_000) return `${Math.round(ms / 1_000)} s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)} min`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)} hr`;
  return `${Math.round(ms / 86_400_000)} d`;
}

type CadenceFilter = 'all' | 'within' | 'beyond';

type EntriesView = 'records' | 'duplicates';

function Pager({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (next: number) => void;
}) {
  if (total === 0) return null;
  const pageCount = Math.ceil(total / pageSize);
  const from = page * pageSize + 1;
  const to = Math.min(page * pageSize + pageSize, total);
  const hasPrev = page > 0;
  const hasNext = page < pageCount - 1;
  return (
    <div className="flex shrink-0 items-center justify-between gap-3 border-t border-white/10 px-4 py-2.5">
      <p className="text-muted-foreground text-xs tabular-nums">
        <span className="text-foreground">
          {from}–{to}
        </span>{' '}
        of {total} · page {page + 1} of {pageCount}
      </p>
      <div className="flex items-center gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!hasPrev}
          onClick={() => onPage(page - 1)}
        >
          <ChevronLeftIcon className="size-4" />
          Prev
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!hasNext}
          onClick={() => onPage(page + 1)}
        >
          Next
          <ChevronRightIcon className="size-4" />
        </Button>
      </div>
    </div>
  );
}

const CADENCE_FILTERS: ReadonlyArray<{ value: CadenceFilter; label: string }> =
  [
    { value: 'all', label: 'All' },
    { value: 'within', label: 'Unsettled' },
    { value: 'beyond', label: 'Settled' },
  ];

function PartitionEntries({
  partition,
  collection,
  cadence,
  onSelect,
}: {
  partition: InspectorPartition;
  collection: Collection<any, any, any>;
  cadence: CadenceConfig | undefined;
  onSelect: (value: unknown) => void;
}) {
  const [page, setPage] = useState(0);
  const [cadenceFilter, setCadenceFilter] = useState<CadenceFilter>('all');
  const [view, setView] = useState<EntriesView>('records');

  const hasFilter = partition.partitionKind === 'partition';
  const showCadence = cadence != null;

  const { data: entities } = useLiveQuery(
    (q) => {
      const base = q.from({ row: collection });
      const filtered = hasFilter
        ? base.where(({ row }) =>
            eq(
              (row as Record<string, unknown>)[partition.partitionField],
              partition.partitionValue,
            ),
          )
        : base;
      return filtered.orderBy(({ row }) => updatedAt(row), 'desc');
    },
    [collection, hasFilter, partition.partitionField, partition.partitionValue],
  );

  const { records, duplicateGroups, unsettledCount, countByU } = useMemo(() => {
    const allRows = entities ?? [];

    // How many records share each `_u` — drives the duplicate highlight and the
    // grouped view.
    const countByU = new Map<string, number>();
    for (const row of allRows) {
      const u = updatedAt(row);
      countByU.set(u, (countByU.get(u) ?? 0) + 1);
    }

    // Duplicate `_u` groups (count > 1), most-duplicated first.
    const duplicateGroups = [...countByU.entries()]
      .filter(([, count]) => count > 1)
      .map(([u, count]) => ({ u, count }))
      .sort((a, b) => b.count - a.count || b.u.localeCompare(a.u));

    if (!showCadence || !cadence) {
      return { records: allRows, duplicateGroups, unsettledCount: 0, countByU };
    }

    // Records inside the cadence window are the unsettled (suspect) ones the
    // repair loop targets.
    const isWithin = (row: unknown) => {
      const v = cadenceValue(row);
      return v !== null && v < cadence.window;
    };
    const unsettledCount = allRows.reduce(
      (n, row) => (isWithin(row) ? n + 1 : n),
      0,
    );

    const records =
      cadenceFilter === 'all'
        ? allRows
        : allRows.filter((row) => {
            const value = cadenceValue(row);
            if (value === null) return false;
            return cadenceFilter === 'within' ? isWithin(row) : !isWithin(row);
          });

    return { records, duplicateGroups, unsettledCount, countByU };
  }, [entities, cadence, cadenceFilter, showCadence]);

  const total = view === 'records' ? records.length : duplicateGroups.length;
  const pageCount = Math.ceil(total / PAGE_SIZE);
  const safePage = Math.min(page, Math.max(0, pageCount - 1));
  const from = safePage * PAGE_SIZE;
  const pageRecords = records.slice(from, from + PAGE_SIZE);
  const pageGroups = duplicateGroups.slice(from, from + PAGE_SIZE);

  const switchView = (next: EntriesView) => {
    setView(next);
    setPage(0);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-1.5 border-b border-white/10 px-4 py-2.5">
        <Button
          type="button"
          size="sm"
          variant={view === 'records' ? 'secondary' : 'ghost'}
          onClick={() => switchView('records')}
        >
          Records
        </Button>
        <Button
          type="button"
          size="sm"
          variant={view === 'duplicates' ? 'secondary' : 'ghost'}
          onClick={() => switchView('duplicates')}
        >
          Duplicate _u
          {duplicateGroups.length > 0 && (
            <span className="text-muted-foreground ml-1 tabular-nums">
              {duplicateGroups.length}
            </span>
          )}
        </Button>
        {view === 'records' && showCadence && (
          <>
            <div className="bg-white/10 mx-1 h-5 w-px" />
            {CADENCE_FILTERS.map((option) => (
              <Button
                key={option.value}
                type="button"
                size="sm"
                variant={cadenceFilter === option.value ? 'secondary' : 'ghost'}
                onClick={() => {
                  setCadenceFilter(option.value);
                  setPage(0);
                }}
              >
                {option.label}
                {option.value === 'within' && unsettledCount > 0 && (
                  <Badge variant="destructive" className="ml-1.5 tabular-nums">
                    {unsettledCount}
                  </Badge>
                )}
              </Button>
            ))}
          </>
        )}
      </div>
      <ScrollArea className="min-h-0 flex-1">
        {total === 0 ? (
          <p className="text-muted-foreground p-4 text-sm">
            {view === 'records'
              ? 'No entries in this partition.'
              : 'No duplicate _u values.'}
          </p>
        ) : view === 'records' ? (
          <Table className="w-full table-fixed">
            <TableHeader>
              <TableRow className="border-white/10 hover:bg-transparent">
                <TableHead className="w-[140px]">id</TableHead>
                <TableHead>_u</TableHead>
                {showCadence && (
                  <TableHead className="w-[88px] text-right">cadence</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRecords.map((value, index) => {
                const cadenceMs = cadenceValue(value);
                const tone =
                  cadenceMs === null || !cadence
                    ? 'text-muted-foreground'
                    : cadenceMs < cadence.window
                      ? 'text-destructive'
                      : 'text-chart-2';
                const u = updatedAt(value);
                const isDuplicate = (countByU.get(u) ?? 0) > 1;
                return (
                  <TableRow
                    key={`${entityId(value)}-${index}`}
                    onClick={() => onSelect(value)}
                    className="cursor-pointer border-white/5 hover:bg-white/5"
                  >
                    <TableCell className="truncate font-mono text-xs">
                      {entityId(value)}
                    </TableCell>
                    <TableCell
                      className={`truncate font-mono text-[11px] ${
                        isDuplicate ? 'text-chart-7' : 'text-muted-foreground'
                      }`}
                    >
                      {u || '—'}
                    </TableCell>
                    {showCadence && (
                      <TableCell
                        className={`${tone} text-right font-mono text-[11px] whitespace-nowrap tabular-nums`}
                      >
                        {cadenceMs === null ? '—' : formatCadence(cadenceMs)}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : (
          <Table className="w-full table-fixed">
            <TableHeader>
              <TableRow className="border-white/10 hover:bg-transparent">
                <TableHead>_u</TableHead>
                <TableHead className="w-[100px] text-right">records</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageGroups.map((group) => (
                <TableRow
                  key={group.u}
                  className="border-white/5 hover:bg-transparent"
                >
                  <TableCell className="text-chart-7 truncate font-mono text-[11px]">
                    {group.u}
                  </TableCell>
                  <TableCell className="text-right font-mono text-[11px] tabular-nums">
                    {group.count}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </ScrollArea>
      <Pager
        page={safePage}
        pageSize={PAGE_SIZE}
        total={total}
        onPage={setPage}
      />
    </div>
  );
}

export function PartitionEntriesModal({
  active = true,
  data,
  partition,
  onClose,
}: {
  active?: boolean;
  data: InspectorData;
  partition: InspectorPartition | null;
  onClose: () => void;
}) {
  const [selectedEntity, setSelectedEntity] = useState<unknown>(null);
  const open = active && partition !== null;
  const collection = partition
    ? data.getCollection(partition.collectionName)
    : undefined;

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
        <DialogContent className="flex h-[88vh] w-[min(1280px,95vw)] max-w-none flex-col overflow-hidden duration-0 data-closed:animate-none data-open:animate-none sm:max-w-none">
          <DialogHeader className="gap-3">
            <DialogTitle className="flex items-baseline gap-2">
              {partition && partition.partitionField !== '' && (
                <span className="text-muted-foreground font-mono text-xs">
                  {partition.partitionField}
                </span>
              )}
              <span className="truncate font-mono">
                {partition && partition.partitionField !== ''
                  ? partition.partitionValue
                  : partition?.partitionKey}
              </span>
              {partition &&
                (() => {
                  const { label, Icon } =
                    STRATEGY_META[partition.strategyState.strategy];
                  return (
                    <Badge
                      variant="outline"
                      className="gap-1 text-[10px] uppercase"
                    >
                      <Icon className="size-3" />
                      {label}
                    </Badge>
                  );
                })()}
            </DialogTitle>
            {partition && (
              <div className="flex items-center gap-4">
                <div className="flex shrink-0 flex-col">
                  <span className="min-w-[3ch] text-2xl font-semibold tabular-nums">
                    {partition.itemCount}
                  </span>
                  <span className="text-muted-foreground text-[10px] tracking-wide uppercase">
                    entries
                  </span>
                </div>
                <SliceViz
                  className="min-w-0 flex-1"
                  strategyState={partition.strategyState}
                  totalItems={partition.itemCount}
                  active={partition.activity === 'active'}
                  hideCaption
                />
              </div>
            )}
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-hidden">
            {open && partition && collection ? (
              <PartitionEntries
                key={partition.id}
                partition={partition}
                collection={collection}
                cadence={partition.cadence}
                onSelect={setSelectedEntity}
              />
            ) : open ? (
              <p className="text-muted-foreground p-4 text-sm">
                No live collection registered for {partition?.collectionName}.
              </p>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
      <JsonGlassViewer
        value={selectedEntity}
        open={selectedEntity !== null}
        onClose={() => setSelectedEntity(null)}
        title="Entity JSON"
      />
    </>
  );
}
