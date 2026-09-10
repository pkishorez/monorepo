import { Effect } from 'effect';
import { useState } from 'react';
import type { ComponentType, ReactNode } from 'react';
import { Button } from 'kui-toolkit/components/ui/button';
import { Input } from 'kui-toolkit/components/ui/input';
import { Box, ChevronRight, Search } from 'kui-toolkit/lucide';
import { Rpc } from '../../../connections/rpc/index.ts';
import { useRpcQuery, rpcQueryKeys } from '../store-query/index.ts';
import {
  QueryError,
  ListSkeleton,
  EmptyState,
} from '../../query-feedback/index.ts';
import { ResourcePanel } from './resource-panel.tsx';
import { useIsMobile } from 'kui-toolkit/hooks/use-mobile';
import {
  PaneHeader,
  RefreshButton,
  ResourceName,
  Status,
  type NavigationLink,
} from '../state-view/index.ts';

export function ResourceDetails(
  props: Omit<Parameters<typeof ResourcePanel>[0], 'query' | 'isMobile'>,
) {
  const isMobile = useIsMobile();
  const { storeId, stack, stage, resource } = props;
  const query = useRpcQuery(
    Effect.flatMap(Rpc, (rpc) =>
      rpc['AlchemyStateStore.GetResourceState']({
        storeId,
        stack,
        stage,
        resource,
      }),
    ),
    rpcQueryKeys.resource(storeId, stack, stage, resource),
  );
  return <ResourcePanel {...props} query={query} isMobile={isMobile} />;
}

export function ResourceBrowser({
  storeId,
  stack,
  stage,
  resource,
  NavigationLink,
  StageAction,
  outputs,
}: {
  storeId: string;
  stack: string;
  stage: string;
  resource?: string;
  NavigationLink: NavigationLink;
  StageAction: ComponentType<{ stack: string; stage: string }>;
  outputs: ReactNode;
}) {
  const [filter, setFilter] = useState('');
  const summaries = useRpcQuery(
    Effect.flatMap(Rpc, (rpc) =>
      rpc['AlchemyStateStore.ListResourceSummaries']({
        storeId,
        stack,
        stage,
      }),
    ),
    rpcQueryKeys.summaries(storeId, stack, stage),
  );
  const rows = summaries.data?.data ?? [];
  const needle = filter.trim().toLocaleLowerCase();
  const visible = needle
    ? rows.filter(
        (row) =>
          row.fqn.toLocaleLowerCase().includes(needle) ||
          row.type?.toLocaleLowerCase().includes(needle),
      )
    : rows;
  return (
    <div className="space-y-6">
      <PaneHeader
        eyebrow={stack}
        title={stage}
        meta={
          summaries.data
            ? `${rows.length} resource${rows.length === 1 ? '' : 's'}`
            : undefined
        }
        actions={
          <>
            <RefreshButton query={summaries} label="Refresh resources" />
            <StageAction stack={stack} stage={stage} />
          </>
        }
      />

      <section aria-labelledby="resources-heading" className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 id="resources-heading" className="text-sm font-medium">
            Resources
          </h2>
          {rows.length > 0 && (
            <div className="relative w-full max-w-56">
              <Search className="pointer-events-none absolute left-2.5 top-2 size-3.5 text-muted-foreground" />
              <Input
                aria-label="Filter resources"
                placeholder="Filter by name or type"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                className="h-8 pl-7 text-sm shadow-none"
              />
            </div>
          )}
        </div>
        {summaries.error && (
          <QueryError
            message={summaries.error}
            stale={summaries.data !== null}
            pending={summaries.pending}
            onRetry={summaries.refresh}
          />
        )}
        {summaries.pending && !summaries.data && (
          <ListSkeleton label="Loading resources" />
        )}
        {summaries.data && rows.length === 0 && (
          <EmptyState
            icon={Box}
            title="No resources yet"
            description="Resources appear here after the first deployment to this stage."
            action={
              <Button variant="outline" onClick={summaries.refresh}>
                Refresh
              </Button>
            }
          />
        )}
        {rows.length > 0 && visible.length === 0 && (
          <EmptyState
            icon={Search}
            title={`No resources match “${filter}”`}
            description="Check the spelling, or clear the filter to see everything here."
            action={
              <Button variant="outline" onClick={() => setFilter('')}>
                Clear filter
              </Button>
            }
          />
        )}
        {visible.length > 0 && (
          <div className="overflow-hidden rounded-lg border bg-card">
            <div
              className="hidden grid-cols-[minmax(0,1fr)_minmax(8rem,14rem)_7rem] gap-4 border-b bg-muted/30 px-3 py-1.5 text-xs uppercase tracking-wide text-muted-foreground sm:grid"
              aria-hidden="true"
            >
              <span>Name</span>
              <span>Type</span>
              <span>Status</span>
            </div>
            <ul className="divide-y">
              {visible.map((row) => {
                const active = row.fqn === resource;
                return (
                  <li key={row.fqn}>
                    <NavigationLink
                      stack={stack}
                      stage={stage}
                      resource={row.fqn}
                      className={`grid min-h-10 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-0.5 px-3 py-1.5 transition-colors hover:bg-muted/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring sm:grid-cols-[minmax(0,1fr)_minmax(8rem,14rem)_7rem] ${active ? 'bg-muted/60 shadow-[inset_2px_0_0_var(--color-foreground)]' : ''}`}
                      aria-current={active ? 'true' : undefined}
                    >
                      <ResourceName fqn={row.fqn} />
                      <span
                        className="col-start-1 row-start-2 truncate text-xs text-muted-foreground sm:col-start-2 sm:row-start-1 sm:text-sm"
                        title={row.type ?? undefined}
                      >
                        {row.type ?? '—'}
                        {row.kind === 'action' && (
                          <span className="ml-1.5 rounded-sm bg-muted px-1 text-[10px] uppercase tracking-wide">
                            action
                          </span>
                        )}
                      </span>
                      <span className="col-start-2 row-span-2 row-start-1 flex items-center gap-2 sm:col-start-3 sm:row-span-1">
                        <Status status={row.status} />
                        <ChevronRight className="size-3.5 text-muted-foreground sm:hidden" />
                      </span>
                    </NavigationLink>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </section>

      {outputs}
    </div>
  );
}
