import { ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { AnimatePresence, motion } from '@monorepo/frontend/motion';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@monorepo/frontend/components/ui/empty';
import { cn } from '@monorepo/frontend/lib/utils';
import { formatMoney } from '../money/index.ts';

export interface TransactionLine {
  readonly id: string;
  readonly direction: 'sent' | 'received';
  readonly counterpartyName: string;
  readonly amount: number;
  readonly at: string;
}

export function Transactions({ lines }: { lines: readonly TransactionLine[] }) {
  if (lines.length === 0)
    return (
      <Empty className="flex-1 justify-center px-0">
        <EmptyHeader>
          <EmptyTitle>No transactions yet</EmptyTitle>
          <EmptyDescription>
            Send money to someone and it will show up here.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );

  return (
    <ul>
      <AnimatePresence initial={false} mode="popLayout">
        {lines.map((line) => (
          <motion.li
            key={line.id}
            layout
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="group -mx-2 flex h-14 items-center gap-3 rounded-lg px-2 transition-colors hover:bg-muted/50"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
              {line.direction === 'sent' ? (
                <ArrowUpRight className="size-4" />
              ) : (
                <ArrowDownLeft className="size-4" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[0.9375rem]">
                {line.direction === 'sent' ? 'To ' : 'From '}
                {line.counterpartyName}
              </p>
              <p className="text-xs text-muted-foreground">{line.at}</p>
            </div>
            <span
              className={cn(
                'shrink-0 font-mono text-sm tabular-nums',
                line.direction === 'received' && 'text-positive',
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
