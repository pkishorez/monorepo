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
  ArrowRight,
  RefreshCw,
  EllipsisVertical,
} from 'kui-toolkit/lucide';
import { Rpc } from '../../../connections/rpc/index.ts';
import type { storeView } from '../../../../shared/contracts/stores/index.ts';
import { useRpcQuery, rpcQueryKeys } from '../queries/index.ts';
import { describeCredential, useCredentials } from '../../credentials/index.ts';
import {
  QueryError,
  ListSkeleton,
  EmptyState,
} from '../../query-feedback/index.ts';
import { StoreDialog } from './store-dialog.tsx';
import { StoreSwitcher as Switcher } from './store-switcher.tsx';
import { StackCount } from '../explorer/index.ts';

export function StoreSwitcher(
  props: Omit<
    Parameters<typeof Switcher>[0],
    'stores' | 'adding' | 'setAdding'
  >,
) {
  const query = useStores();
  const [adding, setAdding] = useState(false);
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

type Store = typeof storeView.Type;
type StoreLink = ComponentType<{
  storeId: string;
  className?: string;
  children?: ReactNode;
}>;

const useStores = () =>
  useRpcQuery(
    Effect.flatMap(Rpc, (rpc) => rpc['Stores.List']({})),
    rpcQueryKeys.stores,
  );

export function StoreList({
  StoreLink,
  SettingsLink,
  onStoreCreated,
}: {
  StoreLink: StoreLink;
  SettingsLink: ComponentType<{ className?: string; children?: ReactNode }>;
  onStoreCreated: (storeId: string) => void;
}) {
  const query = useStores();
  const [dialog, setDialog] = useState<
    { kind: 'add' } | { kind: 'edit' | 'delete'; store: Store } | null
  >(null);
  const credentials = useCredentials();
  const stateOf = (store: Store) =>
    credentials.data?.find((item) => item.id === store.state.credentialId) ??
    null;
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
  const hasStores = (query.data?.length ?? 0) > 0;

  return (
    <main className="mx-auto w-full max-w-4xl space-y-8 px-4 py-10 sm:px-6 sm:py-14">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="max-w-2xl space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-balance">
            Stores
          </h1>
          <p className="text-sm leading-6 text-muted-foreground text-pretty">
            Each store is one Alchemy state location. Open one to browse stacks,
            stages, resources, and deployment outputs.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" render={<SettingsLink />}>
            <KeyRound />
            Credentials
          </Button>
          {hasStores && (
            <Button size="sm" onClick={() => setDialog({ kind: 'add' })}>
              <Plus />
              Add store
            </Button>
          )}
        </div>
      </div>
      {hasStores && (
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
        <section className="grid justify-items-center rounded-xl border border-dashed bg-card/40 px-6 py-14 text-center sm:py-18">
          <div className="mb-5 grid size-12 place-items-center rounded-xl bg-muted text-muted-foreground shadow-sm">
            <Database className="size-5" aria-hidden="true" />
          </div>
          <h2 className="text-base font-semibold tracking-tight">
            Connect your first store
          </h2>
          <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground text-pretty">
            Pick a Cloudflare credential to start exploring the Alchemy state
            deployed from that account.
          </p>
          <Button className="mt-6" onClick={() => setDialog({ kind: 'add' })}>
            <Plus />
            Add store
          </Button>
        </section>
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
        <ul className="divide-y overflow-hidden rounded-lg bg-card shadow-raised">
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
                  {stateOf(store)
                    ? describeCredential(stateOf(store)!)
                    : 'Credential missing'}
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
    </main>
  );
}

function StoreMenu({
  store,
  onSelect,
}: {
  store: Store;
  onSelect: (kind: 'edit' | 'delete') => void;
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
        <DropdownMenuItem onClick={() => onSelect('edit')}>
          <Pencil />
          Edit store
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
