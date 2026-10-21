import { createContext, useContext, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { View } from '@kestack/kabuki/react';
import { Badge } from '@kestack/web-platform/components/badge';
import { Button } from '@kestack/web-platform/components/button';
import { Input } from '@kestack/web-platform/components/input';
import { XIcon } from '@kestack/web-platform/components/lucide';
import {
  NativeSelect,
  NativeSelectOption,
} from '@kestack/web-platform/components/native-select';
import { Spinner } from '@kestack/web-platform/components/spinner';
import { Pages } from '../../../shared/pages/index.ts';

/*
 * A Pocket drawn: wallet cards, the picked wallet's entries, and, when the
 * Pocket can be written, the forms. Your Pocket and Peek draw the same
 * Queries; what differs comes down through `Ledger`: which wallet is
 * picked, how to pick one, and the writes, which Peek has none of.
 */

type Form = 'wallet' | 'rename' | 'post' | 'transfer' | 'entry';

export interface Writes {
  /** The last write's refusal, beside the form it came from. */
  readonly refused: { readonly form: Form; readonly reason: string } | null;
  readonly newWallet: (name: string) => void;
  readonly rename: (id: string, name: string) => void;
  readonly post: (walletId: string, cents: number, note: string) => void;
  readonly transfer: (
    from: string,
    to: string,
    cents: number,
    note: string,
  ) => void;
  readonly remove: (id: string) => void;
}

export interface Ledger {
  readonly selected: string | null;
  readonly select: (id: string) => void;
  /** The picked wallet's entries, drawn where the wallet's panel wants them. */
  readonly entries: ReactNode;
  readonly writes: Writes | null;
}

export const LedgerContext = createContext<Ledger>({
  selected: null,
  select: () => {},
  entries: null,
  writes: null,
});

/** An id that sorts by when it was made, so new rows sort last. */
export const newId = () =>
  `${Date.now().toString(36).padStart(9, '0')}${Math.random().toString(36).slice(2, 8)}`;

const money = (cents: number) =>
  (cents / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

/** What was typed as an amount, in cents; null unless it is more than zero. */
const centsOf = (typed: string) => {
  const amount = Math.round(Number.parseFloat(typed) * 100);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
};

function Refused({ form }: { readonly form: Form }) {
  const { writes } = useContext(LedgerContext);
  if (writes?.refused?.form !== form) return null;
  return (
    <p role="alert" className="text-sm text-destructive">
      {writes.refused.reason}. Undone.
    </p>
  );
}

const field = 'h-8 text-base sm:text-sm';

function NewWallet({ writes }: { readonly writes: Writes }) {
  const [name, setName] = useState('');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (name.trim() === '') return;
    writes.newWallet(name.trim());
    setName('');
  };
  return (
    <form
      onSubmit={submit}
      className="flex flex-col justify-between gap-2 rounded-lg border border-dashed border-border p-3"
    >
      <label className="text-xs text-muted-foreground" htmlFor="new-wallet">
        New wallet
      </label>
      <div className="flex gap-2">
        <Input
          id="new-wallet"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Savings"
          className={field}
        />
        <Button type="submit" size="sm" variant="outline">
          Add
        </Button>
      </div>
      <Refused form="wallet" />
    </form>
  );
}

function Money({
  wallet,
  writes,
}: {
  readonly wallet: string;
  readonly writes: Writes;
}) {
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const send = (sign: 1 | -1) => {
    const cents = centsOf(amount);
    if (cents === null) return;
    writes.post(wallet, sign * cents, note.trim());
    setAmount('');
    setNote('');
  };
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        send(1);
      }}
      className="space-y-2"
    >
      <div className="flex flex-wrap gap-2">
        <Input
          aria-label="Amount"
          inputMode="decimal"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          placeholder="0.00"
          className={`${field} w-24 tabular-nums`}
        />
        <Input
          aria-label="Note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Note"
          className={`${field} min-w-0 flex-1`}
        />
        <Button type="submit" size="sm">
          Deposit
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => send(-1)}
        >
          Withdraw
        </Button>
      </div>
      <Refused form="post" />
    </form>
  );
}

function Move({
  from,
  others,
  writes,
}: {
  readonly from: string;
  readonly others: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
  }>;
  readonly writes: Writes;
}) {
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const target = others.some(({ id }) => id === to)
    ? to
    : (others[0]?.id ?? '');
  if (others.length === 0)
    return (
      <p className="text-sm text-muted-foreground">
        Add a second wallet to move money between them.
      </p>
    );
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const cents = centsOf(amount);
        if (cents === null || target === '') return;
        writes.transfer(from, target, cents, '');
        setAmount('');
      }}
      className="space-y-2"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label="Amount to move"
          inputMode="decimal"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          placeholder="0.00"
          className={`${field} w-24 tabular-nums`}
        />
        <span className="text-sm text-muted-foreground">to</span>
        <NativeSelect
          aria-label="Wallet to move it to"
          size="sm"
          value={target}
          onChange={(event) => setTo(event.target.value)}
        >
          {others.map(({ id, name }) => (
            <NativeSelectOption key={id} value={id}>
              {name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <Button type="submit" size="sm" variant="outline">
          Move
        </Button>
      </div>
      <Refused form="transfer" />
    </form>
  );
}

function Rename({
  wallet,
  name,
  writes,
}: {
  readonly wallet: string;
  readonly name: string;
  readonly writes: Writes;
}) {
  const [typed, setTyped] = useState<string | null>(null);
  if (typed === null)
    return (
      <Button variant="ghost" size="xs" onClick={() => setTyped(name)}>
        Rename
      </Button>
    );
  return (
    <form
      className="flex gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (typed.trim() !== '' && typed.trim() !== name)
          writes.rename(wallet, typed.trim());
        setTyped(null);
      }}
    >
      <Input
        aria-label="Wallet name"
        autoFocus
        value={typed}
        onChange={(event) => setTyped(event.target.value)}
        onKeyDown={(event) => event.key === 'Escape' && setTyped(null)}
        className={`${field} w-36`}
      />
      <Button type="submit" size="sm" variant="outline">
        Save
      </Button>
    </form>
  );
}

export const WalletsView = View.make(Pages.Wallets, ({ root, model }) => {
  const { selected, select, entries, writes } = useContext(LedgerContext);
  if (model.status === 'failed')
    return (
      <p {...root} role="alert" className="text-sm text-destructive">
        {model.problem}
      </p>
    );
  const wallets = [...model.rows]
    .map(({ row }) => row)
    .sort((a, b) => a.id.localeCompare(b.id));
  const picked = wallets.find(({ id }) => id === selected);
  return (
    <div {...root} className="space-y-6" aria-busy={model.status === 'loading'}>
      {model.status === 'loading' ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner /> Opening from this device…
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          {wallets.map(({ id, name, balance }) => (
            <button
              key={id}
              type="button"
              aria-pressed={id === selected}
              onClick={() => select(id)}
              className="flex flex-col items-start gap-1 rounded-lg border border-border bg-card p-3 text-left transition-[border-color,box-shadow] duration-150 hover:border-foreground/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-pressed:border-foreground aria-pressed:shadow-xs active:scale-[0.99] motion-reduce:transition-none"
            >
              <span className="text-sm text-muted-foreground">{name}</span>
              <span className="text-lg font-semibold tabular-nums">
                {money(balance)}
              </span>
            </button>
          ))}
          {writes && <NewWallet writes={writes} />}
          {wallets.length === 0 && !writes && (
            <p className="text-sm text-muted-foreground sm:col-span-3">
              Nothing kept for this account on this device yet. Switch to it
              once and it syncs.
            </p>
          )}
        </div>
      )}
      {picked && (
        <section
          aria-label={picked.name}
          className="space-y-4 rounded-xl border border-border bg-card p-5"
        >
          <header className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-semibold">{picked.name}</h2>
            {writes && (
              <Rename wallet={picked.id} name={picked.name} writes={writes} />
            )}
          </header>
          {writes && (
            <div className="space-y-3">
              <Money wallet={picked.id} writes={writes} />
              <Move
                from={picked.id}
                others={wallets.filter(({ id }) => id !== picked.id)}
                writes={writes}
              />
              <Refused form="rename" />
            </div>
          )}
          {entries}
        </section>
      )}
    </div>
  );
});

const KIND = {
  deposit: 'Deposit',
  withdrawal: 'Withdrawal',
  transfer: 'Transfer',
} as const;

export const EntriesView = View.make(Pages.Entries, ({ root, model }) => {
  const { writes } = useContext(LedgerContext);
  const entries = [...model.rows]
    .map(({ row }) => row)
    .sort((a, b) => b.id.localeCompare(a.id));
  return (
    <div {...root} className="space-y-2 border-t border-border pt-4">
      {model.status === 'ready' && entries.length === 0 && (
        <p className="text-sm text-muted-foreground">No entries yet.</p>
      )}
      <ul className="divide-y divide-border">
        {entries.map((entry) => (
          <li
            key={entry.id}
            // Not stored yet: an Optimistic Change waiting for the Worker.
            data-pending={entry._meta === undefined ? '' : undefined}
            className="flex items-center gap-3 py-2 text-sm transition-opacity duration-150 data-pending:opacity-60"
          >
            <Badge variant="outline">{KIND[entry.kind]}</Badge>
            <span className="min-w-0 flex-1 truncate text-muted-foreground">
              {entry.note}
            </span>
            <span
              className={`tabular-nums ${entry.amount > 0 ? 'text-positive' : ''}`}
            >
              {entry.amount > 0 ? '+' : '−'}
              {money(Math.abs(entry.amount))}
            </span>
            {writes && (
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`Delete ${KIND[entry.kind].toLowerCase()} ${entry.note}`.trim()}
                onClick={() => writes.remove(entry.id)}
              >
                <XIcon />
              </Button>
            )}
          </li>
        ))}
      </ul>
      <Refused form="entry" />
    </div>
  );
});
