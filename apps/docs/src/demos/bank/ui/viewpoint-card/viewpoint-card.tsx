import { useState, type ReactNode } from 'react';
import { ChevronsUpDown, Plus } from 'lucide-react';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@monorepo/frontend/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@monorepo/frontend/components/ui/popover';
import type { Account } from '../../contract/account/index.ts';
import { formatMoney, Monogram } from '../money/index.ts';

export function ViewpointCard({
  account,
  accounts,
  onBankAs,
  onOpenAccount,
  status,
}: {
  account: Account;
  accounts: readonly Account[];
  onBankAs: (accountId: string) => void;
  onOpenAccount: () => void;
  status: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pick = (act: () => void) => () => {
    setOpen(false);
    act();
  };

  return (
    <section className="rounded-xl border bg-muted/30 p-5">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <button
              type="button"
              aria-label={`Banking as ${account.name} — switch account`}
              className="group -m-2 flex max-w-full min-w-0 items-center gap-3 rounded-lg p-2 text-left outline-none transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring data-popup-open:bg-muted/60"
            />
          }
        >
          <Monogram name={account.name} className="size-11" />
          <div className="min-w-0">
            <p className="text-[0.6875rem] tracking-widest text-muted-foreground uppercase">
              Banking as
            </p>
            <p className="flex items-center gap-1.5 text-lg font-semibold tracking-tight">
              <span className="truncate">{account.name}</span>
              <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
            </p>
          </div>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-0">
          <Command>
            <CommandInput placeholder="Search accounts…" />
            <CommandList>
              <CommandEmpty>No account by that name.</CommandEmpty>
              <CommandGroup heading="Bank as">
                {accounts.map((option) => (
                  <CommandItem
                    key={option.id}
                    value={`${option.name} ${option.id}`}
                    data-checked={option.id === account.id}
                    onSelect={pick(() => onBankAs(option.id))}
                  >
                    <Monogram name={option.name} className="size-6" />
                    <span className="min-w-0 flex-1 truncate">
                      {option.name}
                    </span>
                    <span className="font-mono text-xs text-muted-foreground tabular-nums">
                      {formatMoney(option.balance)}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup>
                <CommandItem
                  value="open a new account"
                  onSelect={pick(onOpenAccount)}
                >
                  <span className="flex size-6 items-center justify-center rounded-full border border-dashed text-muted-foreground">
                    <Plus className="size-3.5" />
                  </span>
                  Open an account
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <div className="mt-4 flex h-14 items-end justify-between gap-4">
        <p className="font-mono text-5xl font-semibold tracking-tight tabular-nums">
          {formatMoney(account.balance)}
        </p>
        {status}
      </div>
    </section>
  );
}
