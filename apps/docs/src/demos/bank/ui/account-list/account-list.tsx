import { Plus } from 'lucide-react';
import {
  ItemContent,
  ItemMedia,
  ItemTitle,
} from '@monorepo/frontend/components/ui/item';
import type { Account } from '../../contract/account/index.ts';
import { formatMoney, Monogram } from '../money/index.ts';

export type ListedAccount = Account;

const row =
  'group -mx-2 flex h-16 w-[calc(100%+1rem)] items-center gap-3 rounded-lg px-2 text-left outline-none transition-colors hover:bg-muted/50 focus-visible:bg-muted/50';

export function AccountList({
  accounts,
  slots,
  action,
  openLabel,
  onPick,
  onOpenAccount,
}: {
  accounts: readonly ListedAccount[];
  slots: number;
  action: string;
  openLabel: string;
  onPick: (accountId: string) => void;
  onOpenAccount: () => void;
}) {
  const fillers = Math.max(0, slots - accounts.length);

  return (
    <ul className="divide-y divide-border/60">
      {accounts.map((account) => (
        <li key={account.id}>
          <button
            type="button"
            onClick={() => onPick(account.id)}
            aria-label={`${action} ${account.name}`}
            className={row}
          >
            <ItemMedia>
              <Monogram name={account.name} />
            </ItemMedia>
            <ItemContent>
              <ItemTitle className="text-[0.9375rem] font-medium">
                {account.name}
              </ItemTitle>
            </ItemContent>
            <span className="shrink-0 font-mono text-sm tabular-nums">
              {formatMoney(account.balance)}
            </span>
          </button>
        </li>
      ))}
      {Array.from({ length: fillers }, (_, index) => (
        <li key={`filler-${index}`} aria-hidden className="h-16" />
      ))}
      <li>
        <button type="button" onClick={onOpenAccount} className={row}>
          <ItemMedia>
            <span className="flex size-9 items-center justify-center rounded-full border border-dashed text-muted-foreground">
              <Plus className="size-4" />
            </span>
          </ItemMedia>
          <ItemContent>
            <ItemTitle className="text-[0.9375rem] font-normal text-muted-foreground group-hover:text-foreground">
              {openLabel}
            </ItemTitle>
          </ItemContent>
        </button>
      </li>
    </ul>
  );
}
