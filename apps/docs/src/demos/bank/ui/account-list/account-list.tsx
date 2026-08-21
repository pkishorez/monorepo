import { Plus } from 'lucide-react';
import { AnimatePresence, motion } from '@monorepo/frontend/motion';
import {
  ItemContent,
  ItemMedia,
  ItemTitle,
} from '@monorepo/frontend/components/ui/item';
import type { Account } from '../../contract/account/index.ts';
import { AnimatedMoney, Monogram, usePulseKey } from '../money/index.ts';

export type ListedAccount = Account;

const row =
  'group relative isolate -mx-2 flex h-14 w-[calc(100%+1rem)] items-center gap-3 rounded-lg px-2 text-left outline-none transition-colors hover:bg-muted/50 focus-visible:bg-muted/50';

function AccountRow({
  account,
  action,
  onPick,
}: {
  account: ListedAccount;
  action: string;
  onPick: (accountId: string) => void;
}) {
  const pulse = usePulseKey(account.balance);

  return (
    <button
      type="button"
      onClick={() => onPick(account.id)}
      aria-label={`${action} ${account.name}`}
      className={row}
    >
      {pulse > 0 && (
        <motion.span
          key={pulse}
          aria-hidden
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 0.9, ease: 'easeOut' }}
          className="pointer-events-none absolute inset-0 -z-10 rounded-lg bg-muted"
        />
      )}
      <ItemMedia>
        <Monogram name={account.name} />
      </ItemMedia>
      <ItemContent>
        <ItemTitle className="text-[0.9375rem] font-medium">
          {account.name}
        </ItemTitle>
      </ItemContent>
      <AnimatedMoney
        amount={account.balance}
        className="shrink-0 font-mono text-sm tabular-nums"
      />
    </button>
  );
}

export function AccountList({
  accounts,
  action,
  openLabel,
  onPick,
  onOpenAccount,
}: {
  accounts: readonly ListedAccount[];
  action: string;
  openLabel: string;
  onPick: (accountId: string) => void;
  onOpenAccount: () => void;
}) {
  return (
    <ul>
      <AnimatePresence initial={false} mode="popLayout">
        {accounts.map((account) => (
          <motion.li
            key={account.id}
            layout
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <AccountRow account={account} action={action} onPick={onPick} />
          </motion.li>
        ))}
        <motion.li key="open-account" layout>
          <button type="button" onClick={onOpenAccount} className={row}>
            <ItemMedia>
              <span className="flex size-9 items-center justify-center rounded-full border border-dashed text-muted-foreground transition-colors group-hover:border-solid group-hover:text-foreground">
                <Plus className="size-4" />
              </span>
            </ItemMedia>
            <ItemContent>
              <ItemTitle className="text-[0.9375rem] font-normal text-muted-foreground transition-colors group-hover:text-foreground">
                {openLabel}
              </ItemTitle>
            </ItemContent>
          </button>
        </motion.li>
      </AnimatePresence>
    </ul>
  );
}
