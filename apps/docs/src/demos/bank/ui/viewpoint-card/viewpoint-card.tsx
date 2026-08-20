import type * as React from 'react';
import { ChevronsUpDown } from 'lucide-react';
import { Button } from '@monorepo/frontend/components/ui/button';
import { cn } from '@monorepo/frontend/lib/utils';
import type { Account } from '../../contract/account/index.ts';
import { formatMoney, Monogram } from '../money/index.ts';

export function ViewpointCard({
  account,
  pending,
  onSwitch,
  status,
}: {
  account: Account;
  pending: boolean;
  onSwitch: () => void;
  status: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border bg-muted/30 p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Monogram
            name={account.name}
            className="size-11 ring-1 ring-border/70"
          />
          <div className="min-w-0">
            <p className="text-[0.6875rem] tracking-widest text-muted-foreground uppercase">
              Banking as
            </p>
            <p className="truncate text-lg font-semibold tracking-tight">
              {account.name}
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onSwitch}
          className="shrink-0 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
        >
          Switch
          <ChevronsUpDown className="size-3.5" />
        </Button>
      </div>
      <div className="mt-4 flex h-14 items-end justify-between gap-4">
        <p
          className={cn(
            'font-mono text-5xl font-semibold tracking-tight tabular-nums transition-opacity',
            pending && 'opacity-40',
          )}
        >
          {formatMoney(account.balance)}
        </p>
        {status}
      </div>
    </section>
  );
}
