import { Effect, Semaphore } from 'effect';
import { useState } from 'react';
import type { ComponentType } from 'react';
import { Button } from 'kui-toolkit/components/ui/button';
import { ChevronRight, Layers, LoaderCircle } from 'kui-toolkit/lucide';
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
import { isAlchemyManagedStack } from '../../../../shared/contracts/state-address/index.ts';
import { ManagedStackBadge } from './managed-stack.tsx';
import { DeleteEmptyStackAction } from './delete-empty-stack.tsx';

type StageAction = ComponentType<{
  stack: string;
  stage: string;
  className?: string;
}>;

/** Stages shown per card before the rest is folded behind a link to the stack. */
const stagesPerCard = 6;

/** Store level: every stack with its stages, so a stage is one click from the store. */
export function StoreOverview({
  storeId,
  storeName,
  NavigationLink,
  StageAction,
  onStackDeleted,
}: {
  storeId: string;
  storeName: string | null;
  NavigationLink: NavigationLink;
  StageAction: StageAction;
  onStackDeleted: (stack: string) => void;
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
        <div className="grid items-start gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {names.map((name) => (
            <StackCard
              key={name}
              storeId={storeId}
              stack={name}
              slots={slots}
              NavigationLink={NavigationLink}
              StageAction={StageAction}
              onStackDeleted={onStackDeleted}
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
  onStackDeleted,
}: {
  storeId: string;
  stack: string;
  slots: Semaphore.Semaphore;
  NavigationLink: NavigationLink;
  StageAction: StageAction;
  onStackDeleted: (stack: string) => void;
}) {
  const managed = isAlchemyManagedStack(stack);
  const stages = useRpcQuery(
    Effect.flatMap(Rpc, (rpc) =>
      rpc['AlchemyStateStore.ListStages']({ storeId, stack }),
    ).pipe(slots.withPermits(1)),
    rpcQueryKeys.stages(storeId, stack),
  );
  const names = stages.data?.data ?? [];
  const shown = names.slice(0, stagesPerCard);
  const hidden = names.length - shown.length;
  return (
    <section
      className={`flex flex-col overflow-hidden rounded-lg shadow-raised ${managed ? 'bg-primary/5' : 'bg-card'}`}
    >
      <NavigationLink
        stack={stack}
        title={stack}
        className={`group/stack flex h-11 items-center gap-2 border-b px-3 text-sm font-medium focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring ${managed ? 'border-primary/20' : 'bg-muted/30'}`}
      >
        <Layers
          className={`size-4 shrink-0 ${managed ? 'text-primary' : 'text-muted-foreground'}`}
        />
        <span className="truncate">{stack}</span>
        {managed && <ManagedStackBadge />}
        <span className="ml-auto flex shrink-0 items-center gap-1 text-xs font-normal text-muted-foreground tabular-nums">
          {stages.data &&
            `${names.length} stage${names.length === 1 ? '' : 's'}`}
          <ChevronRight
            aria-hidden="true"
            className="size-3.5 -translate-x-1 opacity-0 transition-[opacity,translate] duration-150 ease-out group-hover/stack:translate-x-0 group-hover/stack:opacity-100 group-focus-visible/stack:translate-x-0 group-focus-visible/stack:opacity-100 motion-reduce:transition-none"
          />
        </span>
      </NavigationLink>
      <ul
        className={`flex flex-1 flex-col divide-y ${managed ? 'divide-primary/15' : ''}`}
      >
        {stages.pending && !stages.data && <StageSkeleton />}
        {stages.error && !stages.data && (
          <li className="px-3 py-3 text-xs text-destructive">{stages.error}</li>
        )}
        {stages.data && names.length === 0 && (
          <li className="group/row flex items-center pl-3 text-xs text-muted-foreground">
            <span className="flex-1 py-3">No stages deployed.</span>
            <DeleteEmptyStackAction
              storeId={storeId}
              stack={stack}
              onDeleted={onStackDeleted}
              className="opacity-0 transition-opacity duration-150 group-hover/row:opacity-100 group-focus-within/row:opacity-100 pointer-coarse:opacity-100 motion-reduce:transition-none"
            />
          </li>
        )}
        {shown.map((stage) => (
          <li key={stage} className="group/row flex items-center pr-1">
            <NavigationLink
              stack={stack}
              stage={stage}
              title={stage}
              className={`flex h-11 min-w-0 flex-1 items-center gap-3 px-3 text-sm focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring ${managed ? 'hover:bg-primary/10' : 'hover:bg-muted/40'}`}
            >
              <span className="truncate">{stage}</span>
            </NavigationLink>
            <StageAction
              stack={stack}
              stage={stage}
              className="opacity-0 transition-opacity duration-150 group-hover/row:opacity-100 group-focus-within/row:opacity-100 pointer-coarse:opacity-100 motion-reduce:transition-none"
            />
          </li>
        ))}
        {hidden > 0 && (
          <li>
            <NavigationLink
              stack={stack}
              className="flex h-9 items-center px-3 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
            >
              {hidden} more stage{hidden === 1 ? '' : 's'}
            </NavigationLink>
          </li>
        )}
      </ul>
    </section>
  );
}

function StageSkeleton() {
  return (
    <li role="status" aria-label="Loading stages" className="divide-y">
      {[0, 1, 2].map((row) => (
        <div key={row} className="flex h-11 items-center gap-3 px-3">
          <span className="h-3.5 w-24 rounded-sm bg-muted motion-safe:animate-pulse" />
          <span className="ml-auto h-3 w-16 rounded-sm bg-muted motion-safe:animate-pulse" />
        </div>
      ))}
    </li>
  );
}

/** Stack level: its stages with resource counts. */
export function StackOverview({
  storeId,
  stack,
  NavigationLink,
  StageAction,
  onStackDeleted,
}: {
  storeId: string;
  stack: string;
  NavigationLink: NavigationLink;
  StageAction: StageAction;
  onStackDeleted: (stack: string) => void;
}) {
  const managed = isAlchemyManagedStack(stack);
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
        title={
          managed ? (
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate text-primary">{stack}</span>
              <ManagedStackBadge />
            </span>
          ) : (
            stack
          )
        }
        meta={
          stages.data
            ? `${names.length} stage${names.length === 1 ? '' : 's'}`
            : undefined
        }
        actions={
          <>
            <RefreshButton query={stages} label="Refresh stages" />
            {stages.data && names.length === 0 && (
              <DeleteEmptyStackAction
                storeId={storeId}
                stack={stack}
                onDeleted={onStackDeleted}
              />
            )}
          </>
        }
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
        <ul className="divide-y overflow-hidden rounded-lg bg-card shadow-raised">
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
