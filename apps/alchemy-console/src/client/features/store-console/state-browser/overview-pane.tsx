import { Effect, Semaphore } from 'effect';
import { useState } from 'react';
import type { ComponentType } from 'react';
import { Button } from 'kui-toolkit/components/ui/button';
import { Layers, LoaderCircle } from 'kui-toolkit/lucide';
import { Rpc } from '../../../connections/rpc/index.ts';
import { useRpcQuery, rpcQueryKeys } from '../store-query/index.ts';
import {
  QueryError,
  ListSkeleton,
  EmptyState,
} from '../../query-feedback/index.ts';
import {
  PaneHeader,
  RefreshButton,
  type NavigationLink,
} from '../state-view/index.ts';

type StageAction = ComponentType<{ stack: string; stage: string }>;

/** Store level: every stack with its stages, so a stage is one click from the store. */
export function StoreOverview({
  storeId,
  storeName,
  NavigationLink,
  StageAction,
}: {
  storeId: string;
  storeName: string | null;
  NavigationLink: NavigationLink;
  StageAction: StageAction;
}) {
  const [slots] = useState(() => Semaphore.makeUnsafe(4));
  const stacks = useRpcQuery(
    Effect.flatMap(Rpc, (rpc) =>
      rpc['AlchemyStateStore.ListStacks']({ storeId }),
    ),
    rpcQueryKeys.stacks(storeId),
  );
  const names = stacks.data?.data ?? [];
  return (
    <div className="space-y-6">
      <PaneHeader
        eyebrow="Store"
        title={storeName ?? 'Store'}
        meta={
          stacks.data
            ? `${names.length} stack${names.length === 1 ? '' : 's'}`
            : undefined
        }
        actions={<RefreshButton query={stacks} label="Refresh stacks" />}
      />
      {stacks.error && (
        <QueryError
          message={stacks.error}
          stale={stacks.data !== null}
          pending={stacks.pending}
          onRetry={stacks.refresh}
        />
      )}
      {stacks.pending && !stacks.data && (
        <ListSkeleton label="Loading stacks" />
      )}
      {stacks.data && names.length === 0 && (
        <EmptyState
          icon={Layers}
          title="No stacks yet"
          description="Deploy to this store, then refresh to see what’s here."
          action={
            <Button variant="outline" onClick={stacks.refresh}>
              Refresh
            </Button>
          }
        />
      )}
      {names.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {names.map((name) => (
            <StackCard
              key={name}
              storeId={storeId}
              stack={name}
              slots={slots}
              NavigationLink={NavigationLink}
              StageAction={StageAction}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function StackCard({
  storeId,
  stack,
  slots,
  NavigationLink,
  StageAction,
}: {
  storeId: string;
  stack: string;
  slots: Semaphore.Semaphore;
  NavigationLink: NavigationLink;
  StageAction: StageAction;
}) {
  const stages = useRpcQuery(
    Effect.flatMap(Rpc, (rpc) =>
      rpc['AlchemyStateStore.ListStages']({ storeId, stack }),
    ).pipe(slots.withPermits(1)),
    rpcQueryKeys.stages(storeId, stack),
  );
  const names = stages.data?.data ?? [];
  return (
    <section className="flex min-h-32 flex-col rounded-lg border bg-card">
      <NavigationLink
        stack={stack}
        title={stack}
        className="flex items-center gap-2 border-b px-3 py-2.5 text-sm font-medium hover:bg-muted/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
      >
        <Layers className="size-4 text-muted-foreground" />
        <span className="truncate">{stack}</span>
        {stages.data && (
          <span className="ml-auto text-xs font-normal text-muted-foreground tabular-nums">
            {names.length} stage{names.length === 1 ? '' : 's'}
          </span>
        )}
      </NavigationLink>
      <ul className="flex flex-1 flex-col divide-y">
        {stages.pending && !stages.data && (
          <li className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
            <LoaderCircle className="size-3 motion-safe:animate-spin" />
            Loading stages
          </li>
        )}
        {stages.error && !stages.data && (
          <li className="px-3 py-2 text-xs text-destructive">{stages.error}</li>
        )}
        {stages.data && names.length === 0 && (
          <li className="px-3 py-3 text-xs text-muted-foreground">
            No stages deployed.
          </li>
        )}
        {names.map((stage) => (
          <li key={stage} className="flex items-center pr-1">
            <NavigationLink
              stack={stack}
              stage={stage}
              title={stage}
              className="flex h-9 min-w-0 flex-1 items-center gap-2 px-3 text-sm hover:bg-muted/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
            >
              <span className="truncate">{stage}</span>
            </NavigationLink>
            <StageAction stack={stack} stage={stage} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Stack level: its stages with resource counts. */
export function StackOverview({
  storeId,
  stack,
  NavigationLink,
  StageAction,
}: {
  storeId: string;
  stack: string;
  NavigationLink: NavigationLink;
  StageAction: StageAction;
}) {
  const [slots] = useState(() => Semaphore.makeUnsafe(4));
  const stages = useRpcQuery(
    Effect.flatMap(Rpc, (rpc) =>
      rpc['AlchemyStateStore.ListStages']({ storeId, stack }),
    ),
    rpcQueryKeys.stages(storeId, stack),
  );
  const names = stages.data?.data ?? [];
  return (
    <div className="space-y-6">
      <PaneHeader
        eyebrow="Stack"
        title={stack}
        meta={
          stages.data
            ? `${names.length} stage${names.length === 1 ? '' : 's'}`
            : undefined
        }
        actions={<RefreshButton query={stages} label="Refresh stages" />}
      />
      {stages.error && (
        <QueryError
          message={stages.error}
          stale={stages.data !== null}
          pending={stages.pending}
          onRetry={stages.refresh}
        />
      )}
      {stages.pending && !stages.data && (
        <ListSkeleton label="Loading stages" />
      )}
      {stages.data && names.length === 0 && (
        <EmptyState
          icon={Layers}
          title="No stages yet"
          description="Deploy to this stack, then refresh to see what’s here."
          action={
            <Button variant="outline" onClick={stages.refresh}>
              Refresh
            </Button>
          }
        />
      )}
      {names.length > 0 && (
        <ul className="divide-y overflow-hidden rounded-lg border bg-card">
          {names.map((stage) => (
            <li key={stage} className="flex items-center pr-1">
              <NavigationLink
                stack={stack}
                stage={stage}
                title={stage}
                className="flex h-11 min-w-0 flex-1 items-center gap-3 px-3 text-sm font-medium hover:bg-muted/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
              >
                <span className="truncate">{stage}</span>
                <ResourceCount
                  storeId={storeId}
                  stack={stack}
                  stage={stage}
                  slots={slots}
                />
              </NavigationLink>
              <StageAction stack={stack} stage={stage} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ResourceCount({
  storeId,
  stack,
  stage,
  slots,
}: {
  storeId: string;
  stack: string;
  stage: string;
  slots: Semaphore.Semaphore;
}) {
  const query = useRpcQuery(
    Effect.flatMap(Rpc, (rpc) =>
      rpc['AlchemyStateStore.ListResources']({ storeId, stack, stage }),
    ).pipe(slots.withPermits(1)),
    rpcQueryKeys.resources(storeId, stack, stage),
  );
  return (
    <span className="ml-auto flex shrink-0 items-center gap-2 text-xs font-normal text-muted-foreground tabular-nums">
      {query.pending && !query.data && (
        <LoaderCircle
          className="size-3 motion-safe:animate-spin"
          aria-label="Loading resource count"
        />
      )}
      {query.error ? (
        <span title={query.error}>Unavailable</span>
      ) : query.data ? (
        `${query.data.data.length} resource${query.data.data.length === 1 ? '' : 's'}`
      ) : null}
    </span>
  );
}
