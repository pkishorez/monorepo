import { useCallback, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '#components/ui/resizable';
import { ScrollArea } from '#components/ui/scroll-area';
import { Button } from '#components/ui/button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '#components/ui/context-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '#components/ui/alert-dialog';
import { toast } from '#components/ui/sonner';
import { PlusIcon, Trash2Icon } from '#lib/lucide';
import { cn } from '#lib/utils';
import type {
  InspectorCollection,
  InspectorData,
  InspectorPartition,
  InspectorStrategyState,
} from '../view-model';
import { collectionStrategy, resolveCollection } from './collection-state';
import type { ResolvedCollection } from './collection-state';
import { STRATEGY_META } from '../dashboard-kit';
import { CalmResidencyChip } from './calm-residency-chip';
import { CalmStrategyViz } from './calm-strategy-viz';
import { RequestPartitionDialog } from './request-partition-dialog';
import type { RequestPartitionTarget } from './request-partition-dialog';
import { useDevtoolsStore } from '../internal/store';

export type MasterDetailProps = {
  data: InspectorData;
  onSelectPartition: (partition: InspectorPartition) => void;
};

const KIND_GROUPS: { kind: InspectorCollection['kind']; title: string }[] = [
  { kind: 'partitioned', title: 'Partitioned' },
  { kind: 'keyed', title: 'Total collections' },
  { kind: 'single-item', title: 'Single item' },
];

type CollectionGroup = { title: string; items: ResolvedCollection[] };

function groupByKind(resolved: ResolvedCollection[]): CollectionGroup[] {
  return KIND_GROUPS.map(({ kind, title }) => ({
    title,
    items: resolved.filter((r) => r.collection.kind === kind),
  })).filter((g) => g.items.length > 0);
}

/**
 * A collection counts as live only while something is actually subscribed —
 * either the collection itself or any of its partitions. Once every subscriber
 * count drops to zero it is merely resident (in memory) until `gcTime` releases
 * it. Partition `activity` is not a reliable signal here: the global partition
 * is always flagged `active`, so it would mask the in-memory state.
 */
function isSubscribed(resolved: ResolvedCollection): boolean {
  return (
    resolved.collection.subscriberCount > 0 ||
    resolved.partitions.some((p) => p.subscriberCount > 0)
  );
}

function GroupLabel({ title }: { title: string }) {
  return (
    <p className="text-muted-foreground px-1 pt-1 text-[10px] font-medium tracking-wide uppercase">
      {title}
    </p>
  );
}

function useResolvedCollections(data: InspectorData): ResolvedCollection[] {
  return useMemo(
    () =>
      data.collections.map((collection) =>
        resolveCollection(
          collection,
          data.partitions,
          data.sotCounts[collection.collectionName] ?? 0,
        ),
      ),
    [data],
  );
}

function MiniStats({ resolved }: { resolved: ResolvedCollection }) {
  const partitioned = resolved.collection.partitionFields.length > 0;
  return (
    <span className="text-muted-foreground text-[11px] tabular-nums">
      {resolved.itemCount} items · {resolved.collection.subscriberCount} subs
      {partitioned &&
        ` · ${resolved.activeCount}/${resolved.activeCount + resolved.inactiveCount} active`}
    </span>
  );
}

export function MasterDetail({ data, onSelectPartition }: MasterDetailProps) {
  const resolved = useResolvedCollections(data);
  const selectedCollectionId = useDevtoolsStore((s) => s.selectedCollectionId);
  const setSelectedCollectionId = useDevtoolsStore(
    (s) => s.setSelectedCollectionId,
  );
  const masterDetailSplit = useDevtoolsStore((s) => s.masterDetailSplit);
  const setMasterDetailSplit = useDevtoolsStore((s) => s.setMasterDetailSplit);
  const [requestTarget, setRequestTarget] =
    useState<RequestPartitionTarget | null>(null);

  const selectedId = resolved.some(
    (r) => r.collection.id === selectedCollectionId,
  )
    ? selectedCollectionId
    : null;
  const selected = resolved.find((r) => r.collection.id === selectedId) ?? null;
  const groups = groupByKind(resolved);

  const onClearSyncState = useCallback(
    (partition: InspectorPartition) =>
      data.clearPartitionSyncState(
        partition.collectionName,
        partition.partitionKey,
      ),
    [data],
  );
  const onClearEntries = data.clearCollectionEntries;

  return (
    <ResizablePanelGroup
      orientation="horizontal"
      className="h-full"
      onLayoutChanged={(layout) => {
        const left = layout['dt-master'];
        const right = layout['dt-detail'];
        if (typeof left === 'number' && typeof right === 'number') {
          setMasterDetailSplit([left, right]);
        }
      }}
    >
      <ResizablePanel
        id="dt-master"
        defaultSize={masterDetailSplit[0]}
        minSize={20}
      >
        <ScrollArea className="h-full">
          <div className="flex flex-col gap-3 p-2">
            {groups.map((group) => (
              <div key={group.title} className="flex flex-col gap-1">
                <GroupLabel title={group.title} />
                <ul className="flex flex-col gap-1">
                  {group.items.map((r) => {
                    const active = r.collection.id === selected?.collection.id;
                    return (
                      <li key={r.collection.id}>
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedCollectionId(
                              selectedCollectionId === r.collection.id
                                ? null
                                : r.collection.id,
                            )
                          }
                          className={cn(
                            'flex w-full flex-col gap-1 rounded-lg px-3 py-2 text-left transition-colors',
                            active
                              ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                              : 'hover:bg-sidebar-accent/50',
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <span className="min-w-0 flex-1 truncate text-sm font-medium">
                              {r.collection.collectionName}
                            </span>
                            <CalmResidencyChip
                              status={r.collection.status}
                              active={isSubscribed(r)}
                            />
                          </div>
                          <MiniStats resolved={r} />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </ScrollArea>
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel
        id="dt-detail"
        defaultSize={masterDetailSplit[1]}
        minSize={40}
      >
        {resolved.length === 0 ? (
          <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
            No collections registered yet.
          </div>
        ) : selected ? (
          <ScrollArea className="h-full">
            <CollectionSection
              resolved={selected}
              onSelectPartition={onSelectPartition}
              onRequestPartition={setRequestTarget}
              onClearSyncState={onClearSyncState}
              onClearEntries={onClearEntries}
            />
          </ScrollArea>
        ) : (
          <ScrollArea className="h-full">
            <div className="flex flex-col">
              {groups.map((group) => (
                <div key={group.title} className="flex flex-col">
                  <p className="text-muted-foreground bg-muted/30 border-y border-border px-4 py-2 text-[10px] font-medium tracking-wide uppercase">
                    {group.title}
                  </p>
                  <div className="divide-y divide-border">
                    {group.items.map((r) => (
                      <CollectionSection
                        key={r.collection.id}
                        resolved={r}
                        onSelectPartition={onSelectPartition}
                        onRequestPartition={setRequestTarget}
                        onClearSyncState={onClearSyncState}
                        onClearEntries={onClearEntries}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </ResizablePanel>
      <RequestPartitionDialog
        target={requestTarget}
        onClose={() => setRequestTarget(null)}
        onRequest={onSelectPartition}
      />
    </ResizablePanelGroup>
  );
}

type PartitionAxis = {
  field: string;
  partitions: InspectorPartition[];
};

/**
 * Each declared partition field is an axis the collection can be sliced along.
 * We surface every configured axis — even ones with no resident partition yet —
 * so the panel can offer an explicit "request partition" action per axis. The
 * synthetic total-sync row (`partitionField === ''`) has no axis and is grouped
 * on its own.
 */
function groupPartitionsByAxis(resolved: ResolvedCollection): {
  axes: PartitionAxis[];
  global: InspectorPartition[];
} {
  const global = resolved.partitions.filter((p) => p.partitionField === '');
  const axes = resolved.collection.partitionFields.map((field) => ({
    field,
    partitions: resolved.partitions.filter((p) => p.partitionField === field),
  }));
  return { axes, global };
}

function StrategyChip({
  strategy,
}: {
  strategy: InspectorStrategyState['strategy'];
}) {
  const { label, Icon } = STRATEGY_META[strategy];
  return (
    <span className="text-muted-foreground flex items-center gap-1 text-[10px] font-medium tracking-wide uppercase">
      <Icon className="size-3" />
      {label}
    </span>
  );
}

function PartitionCard({
  partition,
  onSelectPartition,
  onClearSyncState,
}: {
  partition: InspectorPartition;
  onSelectPartition: MasterDetailProps['onSelectPartition'];
  onClearSyncState: (partition: InspectorPartition) => Promise<void>;
}) {
  // `activity` is the partition's sync-liveness. A field partition is active only
  // while a query subscribes to it; a global/total partition syncs eagerly, so it
  // stays active while the collection is resident (even with no subscribers) and
  // flips to `cached` once released. Clearing is unsafe while a live sync could
  // re-persist what we delete, so it's gated on the same signal.
  const active = partition.activity === 'active';
  const title =
    partition.partitionField === ''
      ? partition.partitionKey
      : partition.partitionValue;

  const clearSyncState = useMutation({
    mutationFn: () => onClearSyncState(partition),
    onSuccess: () =>
      toast.success('Sync state cleared — re-syncs on next subscription'),
    onError: () => toast.error('Failed to clear sync state'),
  });

  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={
          <button
            type="button"
            onClick={() => onSelectPartition(partition)}
            className={cn(
              'bg-card flex flex-col gap-3 rounded-xl p-4 text-left',
              active && 'outline-chart-2 outline outline-[3px]',
            )}
          />
        }
      >
        <span
          className={cn(
            'min-w-0 truncate font-mono text-xs',
            !active && 'text-muted-foreground',
          )}
        >
          {title}
        </span>
        <div className="flex items-center gap-4">
          <div className="flex shrink-0 flex-col">
            <span className="min-w-[3ch] text-2xl font-semibold tabular-nums">
              {partition.itemCount}
            </span>
            <span className="text-muted-foreground text-[10px] tracking-wide uppercase">
              entries
            </span>
          </div>
          <CalmStrategyViz
            className="min-w-0 flex-1"
            strategyState={partition.strategyState}
            partition={partition}
            hideCaption
          />
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem
          variant="destructive"
          disabled={active || clearSyncState.isPending}
          onClick={() => clearSyncState.mutate()}
        >
          <Trash2Icon />
          Clear sync state
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function AxisGroup({
  field,
  partitions,
  collectionName,
  onSelectPartition,
  onRequestPartition,
  onClearSyncState,
}: {
  field: string;
  partitions: InspectorPartition[];
  collectionName: string;
  onSelectPartition: MasterDetailProps['onSelectPartition'];
  onRequestPartition: (target: RequestPartitionTarget) => void;
  onClearSyncState: (partition: InspectorPartition) => Promise<void>;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground font-mono text-[11px] tracking-wide uppercase">
          {field}
        </span>
        <span className="text-muted-foreground/60 text-[10px] tabular-nums">
          {partitions.length}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-5"
          aria-label={`Request ${field} partition`}
          onClick={() => onRequestPartition({ collectionName, field })}
        >
          <PlusIcon className="size-3" />
        </Button>
      </div>
      {partitions.length === 0 ? (
        <p className="text-muted-foreground/60 text-xs">
          No resident partitions on this axis.
        </p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
          {partitions.map((partition) => (
            <PartitionCard
              key={partition.id}
              partition={partition}
              onSelectPartition={onSelectPartition}
              onClearSyncState={onClearSyncState}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CollectionSection({
  resolved,
  onSelectPartition,
  onRequestPartition,
  onClearSyncState,
  onClearEntries,
}: {
  resolved: ResolvedCollection;
  onSelectPartition: MasterDetailProps['onSelectPartition'];
  onRequestPartition: (target: RequestPartitionTarget) => void;
  onClearSyncState: (partition: InspectorPartition) => Promise<void>;
  onClearEntries: (collectionName: string) => Promise<void>;
}) {
  const { axes, global } = groupPartitionsByAxis(resolved);
  return (
    <div className="flex flex-col gap-6 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <h3 className="text-base font-medium">
            {resolved.collection.collectionName}
          </h3>
          <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
            <CalmResidencyChip
              status={resolved.collection.status}
              active={isSubscribed(resolved)}
            />
            <StrategyChip strategy={collectionStrategy(resolved)} />
            <MiniStats resolved={resolved} />
          </div>
        </div>
        <ClearEntriesAction
          collectionName={resolved.collection.collectionName}
          disabled={isSubscribed(resolved)}
          onClearEntries={onClearEntries}
        />
      </div>
      {global.length > 0 && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
          {global.map((partition) => (
            <PartitionCard
              key={partition.id}
              partition={partition}
              onSelectPartition={onSelectPartition}
              onClearSyncState={onClearSyncState}
            />
          ))}
        </div>
      )}
      {axes.map((axis) => (
        <AxisGroup
          key={axis.field}
          field={axis.field}
          partitions={axis.partitions}
          collectionName={resolved.collection.collectionName}
          onSelectPartition={onSelectPartition}
          onRequestPartition={onRequestPartition}
          onClearSyncState={onClearSyncState}
        />
      ))}
    </div>
  );
}

function ClearEntriesAction({
  collectionName,
  disabled,
  onClearEntries,
}: {
  collectionName: string;
  disabled: boolean;
  onClearEntries: (collectionName: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const clearEntries = useMutation({
    mutationFn: () => onClearEntries(collectionName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devtools-sot-counts'] });
      toast.success(`Cleared stored entries for ${collectionName}`);
      setOpen(false);
    },
    onError: () => toast.error('Failed to clear stored entries'),
  });

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            className="text-destructive hover:text-destructive h-auto shrink-0 gap-1 px-1.5 py-0.5 text-[11px]"
          />
        }
      >
        <Trash2Icon className="size-3" />
        Clear stored entries
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Clear stored entries?</AlertDialogTitle>
          <AlertDialogDescription>
            Deletes every cached entry for{' '}
            <span className="font-mono">{collectionName}</span> from offline
            storage. Nothing is deleted on the server — the collection re-syncs
            on its next subscription.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={clearEntries.isPending}
            onClick={() => clearEntries.mutate()}
          >
            Clear entries
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
