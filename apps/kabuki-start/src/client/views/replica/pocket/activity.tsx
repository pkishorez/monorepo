import { useContext } from 'react';
import { View } from '@kestack/kabuki/react';
import { Button } from '@kestack/web-platform/components/button';
import { XIcon } from '@kestack/web-platform/components/lucide';
import { Pages } from '../../../../shared/pages/index.ts';
import { LedgerContext, money, signed } from './ledger.ts';
import { Refusal } from './refusal.tsx';

/*
 * The latest entries across every wallet, newest first: what kind, which
 * wallet, how much, and faded while it waits for the Worker. A transfer
 * is two entries, one per wallet, drawn as one row from its sending side.
 */

const LATEST = 8;

const KIND = {
  deposit: 'Deposit',
  withdrawal: 'Withdrawal',
  transfer: 'Moved',
} as const;

export const EntriesView = View.make(Pages.Entries, ({ root, model }) => {
  const { writes, refusedAt, nameOf } = useContext(LedgerContext);
  if (model.status !== 'ready') return <div {...root} />;
  const entries = model.rows
    .map(({ row }) => row)
    .filter((entry) => entry.kind !== 'transfer' || entry.amount < 0)
    .sort((a, b) => b.id.localeCompare(a.id))
    .slice(0, LATEST);
  return (
    <section {...root} aria-labelledby="replica-activity" className="space-y-2">
      <h3
        id="replica-activity"
        className="text-xs font-medium tracking-wide text-muted-foreground uppercase"
      >
        Activity
      </h3>
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing yet. Every change shows here.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {entries.map((entry) => {
            // Not stored yet: an Optimistic Change waiting for the Worker.
            const pending = entry._meta === undefined;
            const to =
              entry.kind === 'transfer' && entry.transferId !== null
                ? model.rows.find(
                    ({ row }) =>
                      row.transferId === entry.transferId && row.amount > 0,
                  )?.row.walletId
                : undefined;
            return (
              <li
                key={entry.id}
                data-pending={pending ? '' : undefined}
                className="flex min-h-11 items-center gap-3 py-1.5 text-sm transition-opacity duration-150 data-pending:opacity-55 motion-reduce:transition-none"
              >
                <span className="w-20 shrink-0 font-medium">
                  {KIND[entry.kind]}
                </span>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">
                  {nameOf(entry.walletId)}
                  {to !== undefined && ` → ${nameOf(to)}`}
                  {pending && <span className="ml-2 text-xs">saving…</span>}
                </span>
                <span
                  className={`shrink-0 tabular-nums ${entry.kind === 'deposit' ? 'text-positive' : ''}`}
                >
                  {entry.kind === 'transfer'
                    ? money(-entry.amount)
                    : signed(entry.amount)}
                </span>
                {writes && (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="-mr-1 touch-manipulation text-muted-foreground pointer-coarse:size-11"
                    aria-label={`Delete ${KIND[entry.kind].toLowerCase()} ${signed(entry.amount)} in ${nameOf(entry.walletId)}`}
                    onClick={() => writes.remove(entry.id)}
                  >
                    <XIcon />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <Refusal reason={refusedAt('activity')} />
    </section>
  );
});
