import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@monorepo/frontend/components/ui/dialog';
import { cn } from '@monorepo/frontend/lib/utils';
import type { Account } from '../../contract/account/index.ts';
import { formatMoney } from './money.ts';
import { mono } from './shared.ts';

export interface TransactionLine {
  readonly id: string;
  readonly direction: 'sent' | 'received';
  readonly counterpartyName: string;
  readonly amount: number;
  readonly at: string;
}

const scrollBox =
  '-mx-6 max-h-[min(50dvh,24rem)] overflow-x-hidden overflow-y-auto overscroll-contain px-6 [scrollbar-color:var(--border)_transparent] [scrollbar-width:thin]';

function Lines({ lines }: { lines: readonly TransactionLine[] }) {
  if (lines.length === 0)
    return (
      <p className="flex h-12 items-center text-sm text-muted-foreground/60">
        No transactions yet
      </p>
    );
  return (
    <ul>
      {lines.map((line) => (
        <li
          key={line.id}
          className="flex h-12 items-baseline justify-between gap-6"
        >
          <span className="flex min-w-0 items-baseline gap-2 truncate text-sm">
            <span className="truncate">{line.counterpartyName}</span>
            <span className="text-xs text-muted-foreground/60">{line.at}</span>
          </span>
          <span
            className={cn(
              mono,
              'shrink-0 text-base',
              line.direction === 'sent' ? 'text-destructive' : 'text-primary',
            )}
          >
            {line.direction === 'sent' ? '−' : '+'}
            {formatMoney(line.amount)}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function TransactionsDialog({
  account,
  lines,
  onClose,
}: {
  account: Account | null;
  lines: readonly TransactionLine[];
  onClose: () => void;
}) {
  return (
    <Dialog open={account !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="top-24 max-w-sm -translate-y-0 gap-4 p-6"
      >
        <DialogHeader className="gap-1 text-left">
          <DialogTitle className="flex items-baseline justify-between gap-6 text-base">
            <span className="truncate">{account?.name}</span>
            <span className={cn(mono, 'shrink-0 text-xl font-normal')}>
              {account !== null && formatMoney(account.balance)}
            </span>
          </DialogTitle>
          <DialogDescription className="text-xs">
            {lines.length === 0
              ? 'Transactions'
              : `${lines.length} transaction${lines.length === 1 ? '' : 's'}, newest first`}
          </DialogDescription>
        </DialogHeader>
        <div className={scrollBox}>
          <Lines lines={lines} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
