import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@monorepo/frontend/components/ui/dialog';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@monorepo/frontend/components/ui/drawer';
import { useIsMobile } from '@monorepo/frontend/hooks/use-mobile';
import { AnimatePresence, motion } from '@monorepo/frontend/motion';
import { cn } from '@monorepo/frontend/lib/utils';
import type { Account } from '../../contract/account/index.ts';
import { AnimatedMoney } from './animated-money.tsx';
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
  'overflow-x-hidden overflow-y-auto overscroll-contain [scrollbar-color:var(--border)_transparent] [scrollbar-width:thin]';

function Lines({ lines }: { lines: readonly TransactionLine[] }) {
  if (lines.length === 0)
    return (
      <p className="py-2 text-sm text-muted-foreground/60">
        No transactions yet
      </p>
    );
  return (
    <ul className="flex flex-col gap-3">
      <AnimatePresence initial={false}>
        {lines.map((line) => (
          <motion.li
            key={line.id}
            layout="position"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="grid grid-cols-[3.5rem_minmax(0,1fr)_auto] items-baseline gap-4"
          >
            <span className={cn(mono, 'text-xs text-muted-foreground/60')}>
              {line.at}
            </span>
            <span className="truncate text-sm">{line.counterpartyName}</span>
            <span
              className={cn(
                mono,
                'text-base',
                line.direction === 'sent' ? 'text-destructive' : 'text-primary',
              )}
            >
              {line.direction === 'sent' ? '−' : '+'}
              {formatMoney(line.amount)}
            </span>
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  );
}

const summaryOf = (count: number): string =>
  count === 0
    ? 'Transactions'
    : `${count} transaction${count === 1 ? '' : 's'}, newest first`;

export function TransactionsDialog({
  account,
  lines,
  onClose,
}: {
  account: Account | null;
  lines: readonly TransactionLine[];
  onClose: () => void;
}) {
  const mobile = useIsMobile();
  const open = account !== null;
  const onOpenChange = (next: boolean) => {
    if (!next) onClose();
  };
  const balance = (
    <span className={cn(mono, 'text-2xl font-normal text-foreground')}>
      {account !== null && <AnimatedMoney amount={account.balance} />}
    </span>
  );

  if (mobile)
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[85dvh]">
          <DrawerHeader className="gap-1 text-left">
            <DrawerTitle className="truncate text-sm text-muted-foreground">
              {account?.name}
            </DrawerTitle>
            {balance}
            <DrawerDescription className="text-xs">
              {summaryOf(lines.length)}
            </DrawerDescription>
          </DrawerHeader>
          <div className={cn(scrollBox, 'px-4 pb-6')}>
            <Lines lines={lines} />
          </div>
        </DrawerContent>
      </Drawer>
    );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-24 max-w-sm -translate-y-0 gap-4 p-6">
        <DialogHeader className="gap-1 pr-8 text-left">
          <DialogTitle className="truncate text-sm font-normal text-muted-foreground">
            {account?.name}
          </DialogTitle>
          {balance}
          <DialogDescription className="text-xs">
            {summaryOf(lines.length)}
          </DialogDescription>
        </DialogHeader>
        <div className={cn(scrollBox, '-mx-6 max-h-[min(50dvh,24rem)] px-6')}>
          <Lines lines={lines} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
