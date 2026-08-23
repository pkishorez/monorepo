import { useMemo, useState } from 'react';
import { ChevronDownIcon } from 'lucide-react';
import { uTime } from 'std-toolkit/core';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@monorepo/frontend/components/ui/dropdown-menu';
import { cn } from '@monorepo/frontend/lib/utils';
import type { Account } from '../contract/account/index.ts';
import type { Transfer } from '../contract/transfer/index.ts';
import { OpenDialog } from './dialogs/open-dialog.tsx';
import { SeedDialog } from './dialogs/seed-dialog.tsx';
import {
  TransactionsDialog,
  type TransactionLine,
} from './dialogs/transactions-dialog.tsx';
import { AnimatedMoney } from './ledger/animated-money.tsx';
import { Ledger, type Activity } from './ledger/ledger.tsx';
import { mono, textLink, type Opening } from './shared.ts';
import {
  DebugPanel,
  type DebugFailure,
  type DebugPanelProps,
} from './status/debug-panel.tsx';
import { LastEvent, type LastEventLine } from './status/last-event.tsx';
import { StoreLine, type StoreChoice } from './status/store-line.tsx';

export interface BankAttempt {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly amount: number;
  readonly phase: 'sending' | 'refused' | 'failed';
  readonly message: string | null;
  readonly attempt: number;
}

export type BankDebug = Omit<DebugPanelProps, 'failed' | 'onRetry'>;

export interface BankShell {
  readonly stores: readonly StoreChoice[];
  readonly store: string;
  readonly onStore: (value: string) => void;
  readonly backHref: string;
}

export interface BankLedger {
  readonly accounts: readonly Account[];
  readonly activity: ReadonlyMap<string, Activity>;
  readonly fromId: string | null;
  readonly toId: string | null;
  readonly onChoose: (accountId: string) => void;
  readonly onClear: () => void;
  readonly onDropReceiver: () => void;
  readonly onSend: (amount: number, stay?: boolean) => void;
}

export interface BankHistory {
  readonly viewingId: string | null;
  readonly viewed: readonly Transfer[];
  readonly onView: (accountId: string | null) => void;
}

export interface BankAttempts {
  readonly attempts: readonly BankAttempt[];
  readonly onRetry: (attemptId: string) => void;
}

export interface BankAdmin {
  readonly onOpen: (opening: Opening) => void;
  readonly onSeed: (count: number) => void | Promise<void>;
  readonly onClear: () => void;
}

export interface BankDiagnostics {
  readonly debug: BankDebug | null;
  readonly onDebug: (open: boolean) => void;
  readonly onTraces: () => void;
}

export interface BankProps {
  readonly shell: BankShell;
  readonly ledger: BankLedger;
  readonly history: BankHistory;
  readonly attempts: BankAttempts;
  readonly admin: BankAdmin | null;
  readonly diagnostics: BankDiagnostics;
}

const EMPTY_LINES: readonly TransactionLine[] = [];

const timeOf = (ulid: string): string => {
  const ms = uTime(ulid);
  return ms === null
    ? ''
    : new Date(ms).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
};

const richestFirst = (a: Account, b: Account): number =>
  b.balance - a.balance ||
  a.name.localeCompare(b.name) ||
  a.id.localeCompare(b.id);

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

function AdminMenu({
  admin,
  onOpen,
  onSeed,
}: {
  admin: BankAdmin;
  onOpen: () => void;
  onSeed: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(textLink, 'inline-flex items-center gap-1 text-primary')}
      >
        Admin
        <ChevronDownIcon className="size-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-44">
        <DropdownMenuItem onClick={onOpen}>Open an account</DropdownMenuItem>
        <DropdownMenuItem onClick={onSeed}>Seed accounts</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={admin.onClear}>
          Clear all records
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Bank({
  shell,
  ledger,
  history,
  attempts,
  admin,
  diagnostics,
}: BankProps) {
  const [opening, setOpening] = useState(false);
  const [seeding, setSeeding] = useState(false);

  const rows = useMemo(
    () => [...ledger.accounts].sort(richestFirst),
    [ledger.accounts],
  );
  const nameOf = useMemo(
    () => new Map(ledger.accounts.map((account) => [account.id, account.name])),
    [ledger.accounts],
  );
  const busy = useMemo(() => {
    const held = new Set<string>();
    for (const attempt of attempts.attempts) {
      if (attempt.phase !== 'sending') continue;
      held.add(attempt.from);
      held.add(attempt.to);
    }
    return held;
  }, [attempts.attempts]);
  const line = useMemo(
    () => lastEventOf(attempts.attempts),
    [attempts.attempts],
  );
  const failed = useMemo(
    (): readonly DebugFailure[] =>
      attempts.attempts
        .filter((attempt) => attempt.phase === 'failed')
        .sort(newestFirst)
        .map((attempt) => ({
          id: attempt.id,
          fromName: nameOf.get(attempt.from) ?? 'someone',
          toName: nameOf.get(attempt.to) ?? 'someone',
          amount: attempt.amount,
          message: attempt.message ?? '',
        })),
    [attempts.attempts, nameOf],
  );
  const total = rows.reduce((sum, row) => sum + row.balance, 0);

  const viewing = rows.find((row) => row.id === history.viewingId) ?? null;
  const lines: readonly TransactionLine[] = history.viewed.map((t) => {
    const sent = t.from === history.viewingId;
    return {
      id: t.id,
      direction: sent ? 'sent' : 'received',
      counterpartyName: nameOf.get(sent ? t.to : t.from) ?? 'someone',
      amount: t.amount,
      at: timeOf(t.id),
    };
  });

  return (
    <main className="mx-auto flex h-svh max-h-svh w-full max-w-md flex-col overflow-hidden px-6 py-8">
      <div className="my-auto flex min-h-0 flex-col gap-8">
        <header>
          <StoreLine
            stores={shell.stores}
            store={shell.store}
            backHref={shell.backHref}
            onChange={shell.onStore}
          />
        </header>
        <div className="flex min-h-0 flex-col">
          <Ledger
            rows={rows}
            activity={ledger.activity}
            busy={busy}
            fromId={ledger.fromId}
            toId={ledger.toId}
            onChoose={ledger.onChoose}
            onClear={() => {
              if (history.viewingId === null) ledger.onClear();
            }}
            onDropReceiver={ledger.onDropReceiver}
            onSend={ledger.onSend}
            onHistory={history.onView}
          />
        </div>
        <footer className="flex shrink-0 flex-col">
          {diagnostics.debug !== null ? (
            <DebugPanel
              debug={{
                ...diagnostics.debug,
                failed,
                onRetry: attempts.onRetry,
              }}
              onTraces={diagnostics.onTraces}
              onClose={() => diagnostics.onDebug(false)}
            />
          ) : (
            <div className="flex flex-col gap-6">
              <div className="flex h-12 items-baseline justify-between gap-6 border-t border-border/60 pt-4">
                <span className="flex items-baseline gap-4 text-sm text-muted-foreground">
                  {admin !== null && (
                    <AdminMenu
                      admin={admin}
                      onOpen={() => setOpening(true)}
                      onSeed={() => setSeeding(true)}
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => diagnostics.onDebug(true)}
                    className={cn(textLink, 'text-xs')}
                  >
                    Debug
                  </button>
                  <button
                    type="button"
                    onClick={diagnostics.onTraces}
                    className={cn(textLink, 'text-xs')}
                  >
                    Traces
                  </button>
                </span>
                <span
                  className={cn(
                    'flex shrink-0 flex-col items-end gap-1 transition-opacity',
                    rows.length === 0 && 'opacity-0',
                  )}
                >
                  <p
                    aria-label="Total money in the bank"
                    className={cn(mono, 'text-xl')}
                  >
                    <AnimatedMoney amount={total} />
                  </p>
                  <p
                    className={cn(
                      mono,
                      'text-[0.6875rem] leading-none text-muted-foreground',
                    )}
                  >
                    {rows.length.toLocaleString()} accounts
                  </p>
                </span>
              </div>
              <LastEvent line={line} onRetry={attempts.onRetry} />
            </div>
          )}
        </footer>
      </div>
      <TransactionsDialog
        account={viewing}
        lines={viewing === null ? EMPTY_LINES : lines}
        onClose={() => history.onView(null)}
      />
      {admin !== null && (
        <>
          <OpenDialog
            open={opening}
            onOpenChange={setOpening}
            onOpen={admin.onOpen}
          />
          <SeedDialog
            open={seeding}
            onOpenChange={setSeeding}
            onSeed={(count) => void admin.onSeed(count)}
          />
        </>
      )}
    </main>
  );
}
