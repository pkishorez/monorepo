import { useMemo, useState } from 'react';
import { uTime } from 'std-toolkit/core';
import { cn } from '@monorepo/frontend/lib/utils';
import type { Account } from '../../contract/account/index.ts';
import type { Transfer } from '../../contract/transfer/index.ts';
import {
  DebugPanel,
  type DebugFailure,
  type DebugLineProps,
} from './debug-line.tsx';
import { LastEvent, type LastEventLine } from './last-event.tsx';
import { AnimatedMoney } from './animated-money.tsx';
import { Ledger } from './ledger.tsx';
import { OpenDialog } from './open-dialog.tsx';
import { mono, textLink, type Opening } from './shared.ts';
import { StoreLine, type StoreChoice } from './store-line.tsx';
import {
  TransactionsDialog,
  type TransactionLine,
} from './transactions-dialog.tsx';

export type { Opening } from './shared.ts';

export type BankStore = StoreChoice;

export interface BankAttempt {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly amount: number;
  readonly phase: 'sending' | 'refused' | 'failed';
  readonly message: string | null;
  readonly attempt: number;
}

export type BankDebug = Omit<DebugLineProps, 'failed' | 'onRetry'>;

export interface BankProps {
  readonly stores: readonly BankStore[];
  readonly store: string;
  readonly onStore: (value: string) => void;
  readonly backHref: string;
  readonly accounts: readonly Account[];
  readonly transfers: readonly Transfer[];
  readonly attempts: readonly BankAttempt[];
  readonly fromId: string | null;
  readonly toId: string | null;
  readonly onPick: (accountId: string) => void;
  readonly onCancel: () => void;
  readonly onUntarget: () => void;
  readonly onSwap: () => void;
  readonly onSend: (amount: number, stay?: boolean) => void;
  readonly onOpen: (opening: Opening) => void;
  readonly onRetry: (attemptId: string) => void;
  readonly debug: BankDebug | null;
  readonly onDebug: (open: boolean) => void;
}

const timeOf = (ulid: string): string => {
  const ms = uTime(ulid);
  return ms === null
    ? ''
    : new Date(ms).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
};

const byName = (a: Account, b: Account): number =>
  a.name.localeCompare(b.name) || a.id.localeCompare(b.id);

const newestFirst = <T extends { readonly id: string }>(a: T, b: T): number =>
  b.id.localeCompare(a.id);

const lastEventOf = (
  attempts: readonly BankAttempt[],
): LastEventLine | null => {
  const problem = [...attempts]
    .filter((attempt) => attempt.phase !== 'sending' || attempt.attempt > 0)
    .sort(newestFirst)[0];
  if (problem !== undefined)
    return problem.phase === 'sending'
      ? { kind: 'retrying', id: problem.id }
      : { kind: problem.phase, id: problem.id, message: problem.message ?? '' };
  return null;
};

export function Bank(props: BankProps) {
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);

  const rows = useMemo(
    () => [...props.accounts].sort(byName),
    [props.accounts],
  );
  const nameOf = useMemo(
    () => new Map(props.accounts.map((account) => [account.id, account.name])),
    [props.accounts],
  );
  const busy = useMemo(() => {
    const held = new Set<string>();
    for (const attempt of props.attempts) {
      if (attempt.phase !== 'sending') continue;
      held.add(attempt.from);
      held.add(attempt.to);
    }
    return held;
  }, [props.attempts]);
  const line = useMemo(() => lastEventOf(props.attempts), [props.attempts]);
  const failed = useMemo(
    (): readonly DebugFailure[] =>
      props.attempts
        .filter((attempt) => attempt.phase === 'failed')
        .sort(newestFirst)
        .map((attempt) => ({
          id: attempt.id,
          fromName: nameOf.get(attempt.from) ?? 'someone',
          toName: nameOf.get(attempt.to) ?? 'someone',
          amount: attempt.amount,
          message: attempt.message ?? '',
        })),
    [props.attempts, nameOf],
  );
  const total = rows.reduce((sum, row) => sum + row.balance, 0);

  const linesOf = (accountId: string): readonly TransactionLine[] =>
    props.transfers
      .filter((t) => t.from === accountId || t.to === accountId)
      .sort(newestFirst)
      .map((t) => {
        const sent = t.from === accountId;
        return {
          id: t.id,
          direction: sent ? 'sent' : 'received',
          counterpartyName: nameOf.get(sent ? t.to : t.from) ?? 'someone',
          amount: t.amount,
          at: timeOf(t.id),
        };
      });

  const viewing = rows.find((row) => row.id === viewingId) ?? null;

  return (
    <main className="mx-auto flex h-svh max-h-svh w-full max-w-md flex-col overflow-hidden px-6 py-8">
      <div className="my-auto flex min-h-0 flex-col gap-8">
        <header>
          <StoreLine
            stores={props.stores}
            store={props.store}
            backHref={props.backHref}
            onChange={props.onStore}
          />
        </header>
        <div className="flex min-h-0 flex-col">
          <Ledger
            rows={rows}
            busy={busy}
            fromId={props.fromId}
            toId={props.toId}
            onPick={props.onPick}
            onCancel={() => {
              if (viewingId === null) props.onCancel();
            }}
            onUntarget={props.onUntarget}
            onSwap={props.onSwap}
            onSend={props.onSend}
            onHistory={setViewingId}
          />
        </div>
        <footer className="flex shrink-0 flex-col">
          {props.debug !== null ? (
            <DebugPanel
              debug={{ ...props.debug, failed, onRetry: props.onRetry }}
              onClose={() => props.onDebug(false)}
            />
          ) : (
            <div className="flex flex-col gap-6">
              <div className="flex h-12 items-baseline justify-between gap-6 border-t border-border/60 pt-4">
                <span className="flex items-baseline gap-4 text-sm text-muted-foreground">
                  <button
                    type="button"
                    onClick={() => setOpening(true)}
                    className={textLink}
                  >
                    Open an account
                  </button>
                  <button
                    type="button"
                    onClick={() => props.onDebug(true)}
                    className={cn(textLink, 'text-xs')}
                  >
                    Debug
                  </button>
                </span>
                <p
                  aria-label="Total money in the bank"
                  className={cn(
                    mono,
                    'shrink-0 text-xl transition-opacity',
                    rows.length === 0 && 'opacity-0',
                  )}
                >
                  <AnimatedMoney amount={total} />
                </p>
              </div>
              <LastEvent line={line} onRetry={props.onRetry} />
            </div>
          )}
        </footer>
      </div>
      <TransactionsDialog
        account={viewing}
        lines={viewing === null ? [] : linesOf(viewing.id)}
        onClose={() => setViewingId(null)}
      />
      <OpenDialog
        open={opening}
        onOpenChange={setOpening}
        onOpen={props.onOpen}
      />
    </main>
  );
}
