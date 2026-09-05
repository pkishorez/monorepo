import { useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from 'kui-toolkit/components/ui/dialog';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from 'kui-toolkit/components/ui/drawer';
import { useIsMobile } from 'kui-toolkit/hooks/use-mobile';
import { AnimatePresence, motion } from 'kui-toolkit/motion';
import { cn } from 'kui-toolkit/lib/utils';
import type { Account } from '../../contract/account/index.ts';
import { AnimatedMoney } from '../ledger/animated-money.tsx';
import { formatMoney } from '../ledger/money.ts';
import { mono } from '../shared.ts';
import { LEDGER_PAGE_SIZE } from '../../contract/tuning/index.ts';

export interface TransactionLine {
  readonly id: string;
  readonly direction: 'sent' | 'received';
  readonly counterpartyName: string;
  readonly amount: number;
  readonly at: string;
}

const scrollBox =
  'overflow-x-hidden overflow-y-auto overscroll-contain [scrollbar-color:var(--border)_transparent] [scrollbar-gutter:stable] [scrollbar-width:thin]';

/** Reveals LEDGER_PAGE_SIZE more lines each time the sentinel scrolls into view. */
const useScrollPaging = (total: number) => {
  const [limit, setLimit] = useState(LEDGER_PAGE_SIZE);
  const hasMore = total > limit;
  const scrollRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (!hasMore) return;
    const root = scrollRef.current;
    const more = moreRef.current;
    if (root === null || more === null) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) setLimit((n) => n + LEDGER_PAGE_SIZE);
      },
      { root, rootMargin: '200px' },
    );
    observer.observe(more);
    return () => observer.disconnect();
  }, [hasMore]);
  return { limit, hasMore, scrollRef, moreRef };
};

function Lines({
  lines,
  className,
}: {
  lines: readonly TransactionLine[];
  className: string;
}) {
  const { limit, hasMore, scrollRef, moreRef } = useScrollPaging(lines.length);
  return (
    <div ref={scrollRef} className={cn(scrollBox, className)}>
      {lines.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground/60">
          No transactions yet
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          <AnimatePresence initial={false}>
            {lines.slice(0, limit).map((line) => (
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
                <span className="truncate text-sm">
                  {line.counterpartyName}
                </span>
                <span
                  className={cn(
                    mono,
                    'text-base',
                    line.direction === 'sent'
                      ? 'text-destructive'
                      : 'text-primary',
                  )}
                >
                  {line.direction === 'sent' ? '−' : '+'}
                  {formatMoney(line.amount)}
                </span>
              </motion.li>
            ))}
          </AnimatePresence>
          {hasMore && <li ref={moreRef} aria-hidden className="h-px" />}
        </ul>
      )}
    </div>
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
          <Lines lines={lines} className="px-4 pb-6" />
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
        <Lines lines={lines} className="-mx-6 max-h-[min(50dvh,24rem)] px-6" />
      </DialogContent>
    </Dialog>
  );
}
