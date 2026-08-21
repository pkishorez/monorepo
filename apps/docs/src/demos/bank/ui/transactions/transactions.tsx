import { ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { Button } from '@monorepo/frontend/components/ui/button';
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
  readonly counterpartyId: string;
  readonly counterpartyName: string;
  readonly amount: number;
  readonly at: string;
}

export function Transactions({
  lines,
  slots,
  onBankAs,
}: {
  lines: readonly TransactionLine[];
  slots: number;
  onBankAs: (accountId: string) => void;
}) {
  if (lines.length === 0)
    return (
      <Empty className="flex-1 justify-center px-0">
        <EmptyHeader>
          <EmptyTitle>No money has moved yet</EmptyTitle>
          <EmptyDescription>
            Send something and it shows up here, on both sides at once.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );

  const fillers = Math.max(0, slots - lines.length);

  return (
    <ul>
      {lines.map((line) => (
        <li
          key={line.id}
          className="group -mx-2 flex h-16 items-center gap-3 rounded-lg px-2 transition-colors hover:bg-muted/50"
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
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onBankAs(line.counterpartyId)}
            className="shrink-0 px-2 text-xs text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 max-sm:opacity-100"
          >
            Bank as
          </Button>
          <span
            className={cn(
              'shrink-0 font-mono text-sm tabular-nums',
              line.direction === 'received' && 'text-positive',
            )}
          >
            {line.direction === 'sent' ? '−' : '+'}
            {formatMoney(line.amount)}
          </span>
        </li>
      ))}
      {Array.from({ length: fillers }, (_, index) => (
        <li key={`filler-${index}`} aria-hidden className="h-16" />
      ))}
    </ul>
  );
}
