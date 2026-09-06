import { Effect, Semaphore } from 'effect';
import { useState } from 'react';
import type { ComponentType, ReactNode } from 'react';
import { Input } from 'kui-toolkit/components/ui/input';
import { Button } from 'kui-toolkit/components/ui/button';
import {
  Database,
  Search,
  Plus,
  Pencil,
  Trash2,
  ChevronRight,
  LoaderCircle,
  RefreshCw,
} from 'kui-toolkit/lucide';
import { Rpc } from '../../connections/rpc/index.ts';
import type { stateStoreView } from '../../../shared/contracts/state-stores/index.ts';
import { useRpcQuery, rpcQueryKeys } from '../../session/rpc-session/index.ts';
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
    { kind: 'add' } | { kind: 'rename' | 'delete'; store: Store } | null
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

  return (
    <main className="mx-auto max-w-5xl space-y-5 px-4 py-8 sm:px-6 sm:py-10">
      <div className="flex h-8 items-center justify-between">
        <h1 className="text-sm font-medium">
          Stores{' '}
          <span className="ml-2 text-muted-foreground tabular-nums">
            {query.data ? query.data.length : '–'}
          </span>
        </h1>
        <Button size="sm" onClick={() => setDialog({ kind: 'add' })}>
          <Plus />
          Add store
        </Button>
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
          <RefreshCw className={query.pending ? 'animate-spin' : ''} />
        </Button>
      </div>
      {query.error && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm"
        >
          {query.error}{' '}
          <button className="ml-2 underline" onClick={query.refresh}>
            Retry
          </button>
        </div>
      )}
      {query.pending && !query.data && (
        <div
          role="status"
          aria-label="Loading stores"
          className="divide-y overflow-hidden rounded-lg border"
        >
          {[0, 1, 2].map((item) => (
            <div key={item} className="flex h-20 items-center gap-3 px-4">
              <span className="size-4 animate-pulse rounded bg-muted" />
              <span className="h-4 w-36 animate-pulse rounded bg-muted" />
              <span className="ml-auto h-3 w-20 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
      )}
      {query.data?.length === 0 && (
        <section className="rounded-xl border border-dashed py-16 text-center">
          <Database className="mx-auto mb-4 size-10 text-muted-foreground" />
          <h2 className="text-lg font-medium">No stores yet</h2>
          <p className="mb-6 mt-2 text-sm text-muted-foreground">
            Connect a Cloudflare account to get started.
          </p>
          <Button onClick={() => setDialog({ kind: 'add' })}>
            <Plus />
            Add store
          </Button>
        </section>
      )}
      {!!query.data?.length && visible.length === 0 && (
        <p className="rounded-xl border border-dashed py-16 text-center text-sm text-muted-foreground">
          No stores match your search.
        </p>
      )}
      {visible.length > 0 && (
        <div className="divide-y overflow-hidden rounded-lg border bg-card">
          {visible.map((store) => (
            <article
              key={store.id}
              className="group relative grid min-h-20 grid-cols-[1rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-4 py-4 transition-colors hover:bg-muted/40 sm:flex"
            >
              <div className="row-span-2 text-muted-foreground">
                <Database className="size-4" />
              </div>
              <StoreLink
                storeId={store.id}
                className="col-start-2 row-start-1 min-w-0 flex-1 outline-none after:absolute after:inset-0 focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-primary"
              >
                <h2 className="truncate font-medium" title={store.name}>
                  {store.name}
                </h2>
              </StoreLink>
              <div className="col-start-2 row-start-2 justify-self-start sm:ml-auto">
                <StackCount storeId={store.id} slots={countSlots} />
              </div>
              <div className="col-start-3 row-span-2 row-start-1 flex shrink-0 gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="relative z-10 size-11"
                  aria-label={`Rename ${store.name}`}
                  onClick={() => setDialog({ kind: 'rename', store })}
                >
                  <Pencil />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="relative z-10 size-11"
                  aria-label={`Delete ${store.name}`}
                  onClick={() => setDialog({ kind: 'delete', store })}
                >
                  <Trash2 />
                </Button>
              </div>
              <ChevronRight
                className="hidden size-4 shrink-0 text-muted-foreground sm:block"
                aria-hidden="true"
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
    <span className="flex min-w-20 shrink-0 items-center gap-2 text-xs text-muted-foreground tabular-nums">
      {query.pending && (
        <LoaderCircle
          className="size-3 animate-spin"
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
