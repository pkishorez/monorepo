import { Effect, Semaphore } from 'effect';
import { useEffect, useState } from 'react';
import type { ComponentType, ReactNode } from 'react';
import { Button } from 'kui-toolkit/components/ui/button';
import { Input } from 'kui-toolkit/components/ui/input';
import { QueryFeedback, Empty } from './explorer-view.tsx';
import { Outputs } from './stage-outputs.tsx';
import { ResourceDialog } from './resource-dialog.tsx';
import {
  Layers,
  Box,
  ChevronRight,
  RefreshCw,
  Search,
  LoaderCircle,
} from 'kui-toolkit/lucide';
import { Rpc } from '../../connections/rpc/index.ts';
import {
  useRpcQuery,
  rpcQueryKeys,
  useCachedStoreName,
} from '../../session/rpc-session/index.ts';

export type ExplorerLocation = { stack?: string; stage?: string };
type NavigationLink = ComponentType<
  ExplorerLocation & { home?: boolean; className?: string; children: ReactNode }
>;

function ExplorerContent({
  storeId,
  stack,
  stage,
  NavigationLink,
  onStoreName,
  StageAction,
}: ExplorerLocation & {
  storeId: string;
  NavigationLink: NavigationLink;
  onStoreName: (name: string) => void;
  StageAction: ComponentType<{ stack: string; stage: string }>;
}) {
  const [filter, setFilter] = useState('');
  const [tab, setTab] = useState<'resources' | 'outputs'>('resources');
  const [resource, setResource] = useState<string | null>(null);
  const [countSlots] = useState(() => Semaphore.makeUnsafe(4));
  const query = useRpcQuery(
    Effect.flatMap(Rpc, (rpc) =>
      stage !== undefined && stack !== undefined
        ? rpc['AlchemyStateStore.ListResources']({ storeId, stack, stage })
        : stack !== undefined
          ? rpc['AlchemyStateStore.ListStages']({ storeId, stack })
          : rpc['AlchemyStateStore.ListStacks']({ storeId }),
    ),
    stack !== undefined && stage !== undefined
      ? rpcQueryKeys.resources(storeId, stack, stage)
      : stack !== undefined
        ? rpcQueryKeys.stages(storeId, stack)
        : rpcQueryKeys.stacks(storeId),
  );
  const outputsQuery = useRpcQuery(
    Effect.flatMap(Rpc, (rpc) =>
      stack !== undefined && stage !== undefined
        ? rpc['AlchemyStateStore.GetStageOutputs']({ storeId, stack, stage })
        : Effect.succeed(null),
    ),
    rpcQueryKeys.outputs(storeId, stack ?? '', stage ?? ''),
    {
      enabled: tab === 'outputs' && stack !== undefined && stage !== undefined,
    },
  );
  useEffect(() => {
    if (query.data) onStoreName(query.data.storeName);
  }, [query.data, onStoreName]);
  const refresh = () => {
    query.refresh();
  };
  const level =
    stage !== undefined
      ? 'Resources'
      : stack !== undefined
        ? 'Stages'
        : 'Stacks';
  const names = query.data?.data ?? [];
  const visible = names.filter((name) =>
    name.toLocaleLowerCase().includes(filter.toLocaleLowerCase()),
  );
  const rowClass =
    'group flex min-h-16 w-full items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-primary';

  const toolbar = (toolbarQuery: { pending: boolean; refresh: () => void }) => (
    <div className="grid h-24 grid-cols-1 content-between gap-2 sm:flex sm:h-12 sm:items-center sm:justify-between">
      {stage !== undefined && (
        <div
          role="tablist"
          aria-label="Stage content"
          className="flex h-12 items-center gap-5"
        >
          {(['resources', 'outputs'] as const).map((item) => (
            <button
              key={item}
              role="tab"
              id={`${item}-tab`}
              aria-controls={`${item}-panel`}
              aria-selected={tab === item}
              tabIndex={tab === item ? 0 : -1}
              onKeyDown={(event) => {
                if (
                  ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)
                ) {
                  event.preventDefault();
                  const next =
                    event.key === 'Home'
                      ? 'resources'
                      : event.key === 'End'
                        ? 'outputs'
                        : tab === 'resources'
                          ? 'outputs'
                          : 'resources';
                  setTab(next);
                  document.getElementById(`${next}-tab`)?.focus();
                }
              }}
              onClick={() => setTab(item)}
              className={`flex h-full items-center border-b-2 px-1 text-sm font-medium capitalize ${tab === item ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
            >
              {item}
              {item === 'resources' && query.data && (
                <span className="ml-2 text-xs text-muted-foreground tabular-nums">
                  {names.length}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
      {stage === undefined && (
        <h1 className="text-sm font-medium">
          {level}{' '}
          <span className="ml-2 text-muted-foreground tabular-nums">
            {query.data ? names.length : '–'}
          </span>
        </h1>
      )}
      <div className="flex min-w-0 items-center justify-end gap-2">
        {stack !== undefined && stage !== undefined && (
          <StageAction stack={stack} stage={stage} />
        )}
        {tab !== 'outputs' && (
          <>
            <div className="relative w-32 sm:w-56">
              <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" />
              <Input
                aria-label={`Search ${level.toLowerCase()}`}
                placeholder="Search…"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                className="pl-9 shadow-none"
              />
            </div>
          </>
        )}
        <Button
          variant="ghost"
          size="icon"
          disabled={toolbarQuery.pending}
          onClick={toolbarQuery.refresh}
          aria-label={`Refresh ${tab === 'outputs' ? 'outputs' : level.toLowerCase()}`}
          title={`Refresh ${tab === 'outputs' ? 'outputs' : level.toLowerCase()}`}
        >
          <RefreshCw className={toolbarQuery.pending ? 'animate-spin' : ''} />
        </Button>
      </div>
    </div>
  );
  return (
    <>
      {stage !== undefined && <h1 className="sr-only">{stage}</h1>}
      {toolbar(
        tab === 'outputs' ? outputsQuery : { pending: query.pending, refresh },
      )}
      {tab === 'outputs' && stack !== undefined && stage !== undefined ? (
        <Outputs query={outputsQuery} />
      ) : (
        <section
          className="space-y-4"
          role={stage !== undefined ? 'tabpanel' : undefined}
          id="resources-panel"
          aria-labelledby={stage !== undefined ? 'resources-tab' : undefined}
        >
          <QueryFeedback query={query} />
          {query.data && names.length === 0 && (
            <Empty
              title={`No ${level.toLowerCase()} yet`}
              description={
                stage !== undefined
                  ? 'Resources will appear here after deployment.'
                  : `Deploy to this ${stack !== undefined ? 'stack' : 'store'}, then refresh to see what’s here.`
              }
            />
          )}
          {names.length > 0 && visible.length === 0 && (
            <Empty title="No matches" description="Try a different search." />
          )}
          <div className="divide-y overflow-hidden rounded-lg border bg-card empty:hidden">
            {visible.map((name) => {
              const content = (
                <>
                  <span className="text-muted-foreground">
                    {stage !== undefined ? (
                      <Box className="size-4" />
                    ) : (
                      <Layers className="size-4" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium" title={name}>
                      {name}
                    </span>
                  </span>
                  {stage === undefined && (
                    <ChildCount
                      storeId={storeId}
                      stack={stack ?? name}
                      stage={stack !== undefined ? name : undefined}
                      slots={countSlots}
                    />
                  )}
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground group-hover:text-foreground" />
                </>
              );
              return stage !== undefined ? (
                <button
                  type="button"
                  key={name}
                  className={rowClass}
                  onClick={() => setResource(name)}
                  aria-haspopup="dialog"
                >
                  {content}
                </button>
              ) : (
                <div key={name} className="flex items-center pr-2">
                  <NavigationLink
                    stack={stack ?? name}
                    stage={stack !== undefined ? name : undefined}
                    className={`${rowClass} min-w-0 flex-1`}
                  >
                    {content}
                  </NavigationLink>
                  {stack !== undefined && (
                    <StageAction stack={stack} stage={name} />
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
      {resource !== null && stack !== undefined && stage !== undefined && (
        <ResourceDialog
          key={resource}
          storeId={storeId}
          stack={stack}
          stage={stage}
          resource={resource}
          onClose={() => setResource(null)}
        />
      )}
    </>
  );
}

function ChildCount({
  storeId,
  stack,
  stage,
  slots,
}: {
  storeId: string;
  stack: string;
  stage?: string;
  slots: Semaphore.Semaphore;
}) {
  const query = useRpcQuery(
    Effect.flatMap(Rpc, (rpc) =>
      stage === undefined
        ? rpc['AlchemyStateStore.ListStages']({ storeId, stack })
        : rpc['AlchemyStateStore.ListResources']({ storeId, stack, stage }),
    ).pipe(slots.withPermits(1)),
    stage === undefined
      ? rpcQueryKeys.stages(storeId, stack)
      : rpcQueryKeys.resources(storeId, stack, stage),
  );
  const unit = stage === undefined ? 'stage' : 'resource';
  return (
    <span className="flex min-w-24 shrink-0 items-center justify-end gap-2 text-xs text-muted-foreground tabular-nums">
      {query.pending && (
        <LoaderCircle
          className="size-3 animate-spin"
          aria-label={`Loading ${unit} count`}
        />
      )}
      {query.error ? (
        <span title={query.error}>Unavailable</span>
      ) : query.data ? (
        `${query.data.data.length} ${unit}${query.data.data.length === 1 ? '' : 's'}`
      ) : null}
    </span>
  );
}

export function StoreExplorer(
  props: ExplorerLocation & {
    storeId: string;
    NavigationLink: NavigationLink;
    StageAction: ComponentType<{ stack: string; stage: string }>;
  },
) {
  const cachedStoreName = useCachedStoreName(props.storeId);
  const [storeName, setStoreName] = useState<string | null>(cachedStoreName);
  const displayStoreName = cachedStoreName ?? storeName;
  const { NavigationLink, stack, stage } = props;
  const linkClass = 'truncate hover:text-foreground';
  return (
    <main className="mx-auto max-w-5xl space-y-5 px-4 py-8 sm:px-6 sm:py-10">
      <nav aria-label="Breadcrumb" className="flex h-8 min-w-0 items-center">
        <ol className="flex min-w-0 items-center gap-2 whitespace-nowrap text-sm text-muted-foreground">
          <li className="shrink-0">
            <NavigationLink home className={linkClass}>
              Stores
            </NavigationLink>
          </li>
          <li aria-hidden="true">
            <ChevronRight className="size-3" />
          </li>
          <li className="min-w-0 max-w-40 truncate">
            {stack === undefined ? (
              <span aria-current="page" className="text-foreground">
                {displayStoreName ?? (
                  <span
                    className="inline-block h-4 w-24 animate-pulse rounded bg-muted"
                    aria-label="Loading store name"
                  />
                )}
              </span>
            ) : (
              <NavigationLink className={linkClass}>
                <span className="sm:hidden" aria-hidden="true">
                  …
                </span>
                <span className="sr-only sm:not-sr-only">
                  {displayStoreName ?? 'Store'}
                </span>
              </NavigationLink>
            )}
          </li>
          {stack !== undefined && (
            <>
              <li aria-hidden="true">
                <ChevronRight className="size-3" />
              </li>
              <li className="min-w-0 max-w-48 truncate" title={stack}>
                {stage === undefined ? (
                  <span aria-current="page" className="text-foreground">
                    {stack}
                  </span>
                ) : (
                  <NavigationLink stack={stack} className={linkClass}>
                    {stack}
                  </NavigationLink>
                )}
              </li>
            </>
          )}
          {stage !== undefined && (
            <>
              <li aria-hidden="true">
                <ChevronRight className="size-3" />
              </li>
              <li
                aria-current="page"
                className="max-w-[40vw] shrink-0 truncate text-foreground sm:max-w-64"
                title={stage}
              >
                {stage}
              </li>
            </>
          )}
        </ol>
      </nav>
      <ExplorerContent
        key={JSON.stringify([props.storeId, stack, stage])}
        {...props}
        onStoreName={setStoreName}
      />
    </main>
  );
}
