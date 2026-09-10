import { Effect, Semaphore } from 'effect';
import { useState } from 'react';
import type { ComponentType, ReactNode } from 'react';
import { Input } from 'kui-toolkit/components/ui/input';
import { Button } from 'kui-toolkit/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from 'kui-toolkit/components/ui/dropdown-menu';
import {
  Database,
  Search,
  Plus,
  Pencil,
  KeyRound,
  Trash2,
  ChevronRight,
  LoaderCircle,
  RefreshCw,
  EllipsisVertical,
} from 'kui-toolkit/lucide';
import { Rpc } from '../../connections/rpc/index.ts';
import type { stateStoreView } from '../../../shared/contracts/state-stores/index.ts';
import { useRpcQuery, rpcQueryKeys } from '../../session/rpc-session/index.ts';
import {
  QueryError,
  ListSkeleton,
  EmptyState,
} from '../query-feedback/index.ts';
import { StoreDialog } from './store-dialog.tsx';

type Store = typeof stateStoreView.Type;

export function StoreList({
  StoreLink,
  onStoreCreated,
}: {
  StoreLink: ComponentType<{
    storeId: string;
    className?: string;
    children: ReactNode;
  }>;
  onStoreCreated: (storeId: string) => void;
}) {
  const query = useRpcQuery(
    Effect.flatMap(Rpc, (rpc) => rpc['AlchemyStateStore.List']({})),
    rpcQueryKeys.stores,
  );
  const [dialog, setDialog] = useState<
    | { kind: 'add' }
    | { kind: 'rename' | 'delete' | 'credentials'; store: Store }
    | null
  >(null);

  const [filter, setFilter] = useState('');
  const [countSlots] = useState(() => Semaphore.makeUnsafe(4));
  const refresh = () => {
    query.refresh();
  };
  const visible =
    query.data?.filter((store) =>
      store.name.toLocaleLowerCase().includes(filter.toLocaleLowerCase()),
    ) ?? [];
  const empty = query.data?.length === 0;

  return (
    <main className="mx-auto max-w-5xl space-y-5 px-4 py-8 sm:px-6 sm:py-10">
      <div className="flex h-8 items-center justify-between">
        <h1 className="text-base font-semibold tracking-tight">
          Stores{' '}
          <span className="ml-2 font-normal text-muted-foreground tabular-nums">
            {query.data ? query.data.length : '–'}
          </span>
        </h1>
        {!empty && (
          <Button size="sm" onClick={() => setDialog({ kind: 'add' })}>
            <Plus />
            Add store
          </Button>
        )}
      </div>
      <div className="flex h-24 items-end justify-end gap-2 sm:h-12 sm:items-center">
        <div className="relative w-32 sm:w-56">
          <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <Input
            aria-label="Search stores"
            placeholder="Search…"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            className="pl-9 shadow-none"
          />
        </div>
        <Button
          variant="ghost"
          size="icon"
          disabled={query.pending}
          onClick={refresh}
          aria-label="Refresh stores"
          title="Refresh stores"
        >
          <RefreshCw
            className={query.pending ? 'motion-safe:animate-spin' : ''}
          />
        </Button>
      </div>
      {query.error && (
        <QueryError
          message={query.error}
          stale={query.data !== null}
          pending={query.pending}
          onRetry={query.refresh}
        />
      )}
      {query.pending && !query.data && <ListSkeleton label="Loading stores" />}
      {empty && (
        <EmptyState
          icon={Database}
          title="No stores yet"
          description="Connect a Cloudflare account to browse its Alchemy state."
          action={
            <Button onClick={() => setDialog({ kind: 'add' })}>
              <Plus />
              Add store
            </Button>
          }
        />
      )}
      {!!query.data?.length && visible.length === 0 && (
        <EmptyState
          icon={Search}
          title={`No stores match “${filter}”`}
          description="Check the spelling, or clear the search to see every store."
          action={
            <Button variant="outline" onClick={() => setFilter('')}>
              Clear search
            </Button>
          }
        />
      )}
      {visible.length > 0 && (
        <div className="divide-y overflow-hidden rounded-lg border bg-card">
          {visible.map((store) => (
            <article
              key={store.id}
              className="group relative flex min-h-16 items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40"
            >
              <Database className="size-4 shrink-0 text-muted-foreground" />
              <StoreLink
                storeId={store.id}
                className="min-w-0 flex-1 outline-none after:absolute after:inset-0 after:rounded-lg focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-ring"
              >
                <h2 className="truncate text-sm font-medium" title={store.name}>
                  {store.name}
                </h2>
              </StoreLink>
              <StackCount storeId={store.id} slots={countSlots} />
              <ChevronRight
                className="size-4 shrink-0 text-muted-foreground group-hover:text-foreground"
                aria-hidden="true"
              />
              <StoreMenu
                store={store}
                onSelect={(kind) => setDialog({ kind, store })}
              />
            </article>
          ))}
        </div>
      )}
      {dialog && (
        <StoreDialog
          action={dialog}
          onClose={() => setDialog(null)}
          onSaved={(storeId) => {
            setDialog(null);
            if (storeId) onStoreCreated(storeId);
          }}
        />
      )}
    </main>
  );
}

function StoreMenu({
  store,
  onSelect,
}: {
  store: Store;
  onSelect: (kind: 'rename' | 'credentials' | 'delete') => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="relative z-10 -mr-2 size-11 shrink-0"
            aria-label={`Actions for ${store.name}`}
          />
        }
      >
        <EllipsisVertical />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuItem onClick={() => onSelect('rename')}>
          <Pencil />
          Rename
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onSelect('credentials')}>
          <KeyRound />
          Update token and access
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onClick={() => onSelect('delete')}
        >
          <Trash2 />
          Delete store
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function StackCount({
  storeId,
  slots,
}: {
  storeId: string;
  slots: Semaphore.Semaphore;
}) {
  const query = useRpcQuery(
    Effect.flatMap(Rpc, (rpc) =>
      rpc['AlchemyStateStore.ListStacks']({ storeId }),
    ).pipe(slots.withPermits(1)),
    rpcQueryKeys.stacks(storeId),
  );
  return (
    <span className="flex min-w-20 shrink-0 items-center justify-end gap-2 text-xs text-muted-foreground tabular-nums">
      {query.pending && (
        <LoaderCircle
          className="size-3 motion-safe:animate-spin"
          aria-label="Loading stack count"
        />
      )}
      {query.error ? (
        <span title={query.error}>Unavailable</span>
      ) : query.data ? (
        `${query.data.data.length} stack${query.data.data.length === 1 ? '' : 's'}`
      ) : null}
    </span>
  );
}
