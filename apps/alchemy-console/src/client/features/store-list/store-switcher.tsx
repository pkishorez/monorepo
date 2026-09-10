import { Effect } from 'effect';
import { useEffect, useState } from 'react';
import type { ComponentType, ReactNode } from 'react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from 'kui-toolkit/components/ui/dropdown-menu';
import {
  Check,
  ChevronsUpDown,
  Database,
  Plus,
  Settings2,
} from 'kui-toolkit/lucide';
import { Rpc } from '../../connections/rpc/index.ts';
import { useRpcQuery, rpcQueryKeys } from '../../session/rpc-session/index.ts';
import { StoreDialog } from './store-dialog.tsx';
import { rememberStore } from './last-store.ts';

type LinkProps = { className?: string; children?: ReactNode };

export function StoreSwitcher({
  storeId,
  StoreLink,
  ManageLink,
  onStoreCreated,
}: {
  storeId: string;
  StoreLink: ComponentType<LinkProps & { storeId: string }>;
  ManageLink: ComponentType<LinkProps>;
  onStoreCreated: (storeId: string) => void;
}) {
  const query = useRpcQuery(
    Effect.flatMap(Rpc, (rpc) => rpc['AlchemyStateStore.List']({})),
    rpcQueryKeys.stores,
  );
  const [adding, setAdding] = useState(false);
  const current = query.data?.find((store) => store.id === storeId);
  useEffect(() => rememberStore(storeId), [storeId]);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          className="flex h-11 w-full min-w-0 items-center gap-2.5 rounded-md px-2 text-left outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring"
          aria-label="Switch store"
        >
          <span className="grid size-7 shrink-0 place-items-center rounded-md bg-foreground text-background">
            <Database className="size-3.5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium leading-tight">
              {current?.name ?? (
                <span
                  className="inline-block h-3.5 w-24 rounded-sm bg-muted motion-safe:animate-pulse"
                  aria-label="Loading store name"
                />
              )}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {current
                ? current.access === 'admin'
                  ? 'Admin access'
                  : 'View access'
                : 'Store'}
            </span>
          </span>
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="w-(--anchor-width) min-w-56"
        >
          <DropdownMenuGroup>
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Stores
            </DropdownMenuLabel>
            {query.data?.map((store) => (
              <DropdownMenuItem
                key={store.id}
                render={<StoreLink storeId={store.id} />}
              >
                <span className="min-w-0 flex-1 truncate">{store.name}</span>
                {store.id === storeId && <Check className="size-4" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setAdding(true)}>
            <Plus />
            Add store
          </DropdownMenuItem>
          <DropdownMenuItem render={<ManageLink />}>
            <Settings2 />
            Manage stores
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {adding && (
        <StoreDialog
          action={{ kind: 'add' }}
          onClose={() => setAdding(false)}
          onSaved={(created) => {
            setAdding(false);
            if (created) onStoreCreated(created);
          }}
        />
      )}
    </>
  );
}
