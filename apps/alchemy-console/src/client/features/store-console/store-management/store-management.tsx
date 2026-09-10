import { Effect, Semaphore } from 'effect';
import { useEffect, useState } from 'react';
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
  ArrowRight,
  RefreshCw,
  EllipsisVertical,
} from 'kui-toolkit/lucide';
import { Rpc } from '../../../connections/rpc/index.ts';
import type { stateStoreView } from '../../../../shared/contracts/state-stores/index.ts';
import { useRpcQuery, rpcQueryKeys } from '../store-query/index.ts';
import {
  QueryError,
  ListSkeleton,
  EmptyState,
} from '../../query-feedback/index.ts';
import { StoreDialog } from './store-dialog.tsx';
import { recallStore, rememberStore } from './last-store.ts';
import { StoreSwitcher as Switcher } from './store-switcher.tsx';
import { StackCount } from '../state-browser/index.ts';

export function StoreSwitcher(
  props: Omit<
    Parameters<typeof Switcher>[0],
    'stores' | 'adding' | 'setAdding'
  >,
) {
  const query = useStores();
  const [adding, setAdding] = useState(false);
  useEffect(() => rememberStore(props.storeId), [props.storeId]);
  return (
    <Switcher
      {...props}
      stores={query.data ?? []}
      adding={adding}
      setAdding={setAdding}
    />
  );
}

export function useStore(storeId: string) {
  const stores = useStores();
  return stores.data?.find((store) => store.id === storeId) ?? null;
}

type Store = typeof stateStoreView.Type;
type StoreLink = ComponentType<{
  storeId: string;
  className?: string;
  children?: ReactNode;
}>;

const useStores = () =>
  useRpcQuery(
    Effect.flatMap(Rpc, (rpc) => rpc['AlchemyStateStore.List']({})),
    rpcQueryKeys.stores,
  );

/** Sends a returning user straight into a store; shows the store list only when there is nothing to open. */
export function StoreLanding({
  StoreLink,
  onStore,
  onStoreCreated,
}: {
  StoreLink: StoreLink;
  onStore: (storeId: string) => void;
  onStoreCreated: (storeId: string) => void;
}) {
  const query = useStores();
  const target = query.data?.length
    ? (query.data.find((store) => store.id === recallStore()) ?? query.data[0])
        ?.id
    : undefined;
  useEffect(() => {
    if (target) onStore(target);
  }, [target, onStore]);
  if (query.data && query.data.length === 0)
    return <StoreList StoreLink={StoreLink} onStoreCreated={onStoreCreated} />;
  if (query.error)
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <QueryError
          message={query.error}
          pending={query.pending}
          onRetry={query.refresh}
        />
      </div>
    );
  return (
    <p role="status" className="p-8 text-sm text-muted-foreground">
      Opening your store…
    </p>
  );
}

export function StoreList({
  StoreLink,
  onStoreCreated,
}: {
  StoreLink: StoreLink;
  onStoreCreated: (storeId: string) => void;
}) {
  const query = useStores();
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
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8 sm:px-6 sm:py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-lg font-semibold tracking-tight">Stores</h1>
          <p className="text-sm text-muted-foreground">
            Each store is a saved connection to one Alchemy state endpoint.
          </p>
        </div>
        {!empty && (
          <Button size="sm" onClick={() => setDialog({ kind: 'add' })}>
            <Plus />
            Add store
          </Button>
        )}
      </div>
      {!empty && !!query.data?.length && (
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:max-w-64">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              aria-label="Search stores"
              placeholder="Search stores"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              className="h-9 pl-8 shadow-none"
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
      )}
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
        <ul className="divide-y overflow-hidden rounded-lg border bg-card">
          {visible.map((store) => (
            <li
              key={store.id}
              className="group relative flex min-h-14 items-center gap-3 px-3 py-2 transition-colors hover:bg-muted/40"
            >
              <Database className="size-4 shrink-0 text-muted-foreground" />
              <StoreLink
                storeId={store.id}
                className="min-w-0 flex-1 outline-none after:absolute after:inset-0 focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-ring"
              >
                <span
                  className="block truncate text-sm font-medium"
                  title={store.name}
                >
                  {store.name}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {store.access === 'admin' ? 'Admin access' : 'View access'}
                  {store.connection.accountId && (
                    <>
                      {' · '}
                      <span className="font-mono">
                        {store.connection.accountId.slice(0, 8)}…
                      </span>
                    </>
                  )}
                </span>
              </StoreLink>
              <StackCount storeId={store.id} slots={countSlots} />
              <ArrowRight
                className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                aria-hidden="true"
              />
              <StoreMenu
                store={store}
                onSelect={(kind) => setDialog({ kind, store })}
              />
            </li>
          ))}
        </ul>
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
    </div>
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
            className="relative z-10 shrink-0"
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
