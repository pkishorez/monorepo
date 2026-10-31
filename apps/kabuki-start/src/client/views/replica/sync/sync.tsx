import { createContext, use } from 'react';
import { View, useChild, useChildren } from '@kestack/kabuki/react';
import type { ChildData, Handle } from '@kestack/kabuki/react/view';
import { Pages } from '../../../../shared/pages/index.ts';
import { ReplicasAt, useNow } from '../accounts/index.ts';

/*
 * How every Pocket Instance on this device syncs, read only from where it
 * is kept: whether it runs and when it stops in the Replicas actor's Model,
 * whether it leads in its own State, and its Gate, the whole Collection's
 * Strategy and each Window in its own Model.
 *
 * A Window shows its wallet, how its Strategy is doing, who uses it, and,
 * once nothing here does, the seconds until it closes. One open in another
 * tab shows there too: the tab that leads fetches it for them.
 *
 * Names come from the shown Pocket's wallets and the signed-in Accounts;
 * a wallet of another Account shows the end of its id.
 */

type Account = { readonly id: string; readonly email: string };
type Status = 'idle' | 'gated' | 'running' | 'failing' | 'outdated';

const AccountsAt = createContext<ReadonlyArray<Account>>([]);
const WalletsAt = createContext<ReadonlyMap<string, string>>(new Map());

const STATUS = {
  running: { dot: 'bg-positive', text: 'Running' },
  idle: { dot: 'bg-muted-foreground', text: 'Idle' },
  gated: { dot: 'border border-muted-foreground', text: 'Gated' },
  failing: { dot: 'bg-destructive', text: 'Failing' },
  outdated: { dot: 'bg-destructive', text: 'Outdated' },
} as const;

const label = 'text-xs text-muted-foreground';

/** Whole seconds until `until`; nothing on the server and while hydrating. */
function SecondsTo({ until }: { readonly until: number }) {
  const now = useNow();
  if (now === 0) return null;
  return (
    <span className="tabular-nums">
      {Math.max(0, Math.ceil((until - now) / 1000))}s
    </span>
  );
}

function Running({ status, problem }: Run) {
  return (
    <span
      title={problem ?? undefined}
      className={`flex shrink-0 items-center gap-1.5 ${label} ${status === 'failing' || status === 'outdated' ? 'text-destructive' : ''}`}
    >
      <span
        aria-hidden
        className={`size-1.5 shrink-0 rounded-full ${STATUS[status].dot}`}
      />
      {STATUS[status].text}
    </span>
  );
}

type Run = { readonly status: Status; readonly problem: string | null };

/** One Collection as an Instance's Model has it. */
type Synced = {
  readonly collection: string;
  readonly strategy: Run | null;
  readonly windows: ReadonlyArray<
    Run & {
      readonly value: string | number | boolean;
      readonly users: number;
      readonly here: boolean;
      readonly gcAt: number | null;
      readonly elsewhere: boolean;
    }
  >;
};

const capitalized = (text: string) =>
  `${text.charAt(0).toUpperCase()}${text.slice(1)}`;

function Windows({ windows }: { readonly windows: Synced['windows'] }) {
  const names = use(WalletsAt);
  if (windows.length === 0)
    return <p className={`pl-3 ${label}`}>No Window open</p>;
  return (
    <ul className="space-y-2 border-l border-border pl-3">
      {windows.map((window) => {
        const id = String(window.value);
        const where = [
          window.here &&
            (window.users > 0
              ? `This tab · ${window.users} ${window.users === 1 ? 'query' : 'queries'}`
              : null),
          window.elsewhere && 'Another tab',
        ].filter(Boolean);
        return (
          <li key={id} className="space-y-0.5">
            <div className="flex items-center justify-between gap-3">
              <span className="min-w-0 truncate text-sm">
                {names.get(id) ?? `Wallet …${id.slice(-4)}`}
              </span>
              <Running status={window.status} problem={window.problem} />
            </div>
            <p className={label}>
              {where.join(' · ')}
              {window.gcAt !== null && (
                <>
                  {where.length > 0 && ' · '}
                  Closes in <SecondsTo until={window.gcAt} />
                </>
              )}
            </p>
          </li>
        );
      })}
    </ul>
  );
}

function Collection({ synced }: { readonly synced: Synced }) {
  const windowed = synced.strategy === null;
  return (
    <li className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium">
          {capitalized(synced.collection)}
          <span className="font-normal text-muted-foreground">
            {windowed ? ' · by wallet' : ' · all'}
          </span>
        </span>
        {synced.strategy && (
          <Running
            status={synced.strategy.status}
            problem={synced.strategy.problem}
          />
        )}
      </div>
      {(windowed || synced.windows.length > 0) && (
        <Windows windows={synced.windows} />
      )}
    </li>
  );
}

/** Every Pocket Instance Replicas runs, each with its own Model and State. */
const Instances = View.make(Pages.ReplicasLive, ({ model, children }) => {
  const accounts = use(AccountsAt);
  const own = useChildren(children.pocket);
  const running = model.instances.filter((each) => each.replica === 'pocket');
  if (running.length === 0)
    return <p className={label}>No Instance running.</p>;
  return (
    <ul className="space-y-3">
      {running.map(({ key, holders, gcAt }) => {
        const instance = own.find((each) => each.model.key === key);
        const email =
          accounts.find(({ id }) => id === key)?.email ?? `Account ${key}`;
        return (
          <li
            key={key}
            className="space-y-3 rounded-lg border border-border bg-card p-3"
          >
            <div className="space-y-0.5">
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate text-sm font-medium">
                  {email}
                </span>
                <span className={`shrink-0 ${label}`}>
                  {instance === undefined
                    ? 'Opening…'
                    : instance.state._tag === 'Leading'
                      ? 'Leading'
                      : 'Following'}
                </span>
              </div>
              <p className={label}>
                {instance?.model.gate ? 'Gate open' : 'Gate closed'} ·{' '}
                {gcAt !== null ? (
                  <>
                    Stops in <SecondsTo until={gcAt} />
                  </>
                ) : (
                  `Held by ${holders.length}`
                )}
              </p>
            </div>
            {instance && (
              <ul className="space-y-3">
                {instance.model.collections.map((synced) => (
                  <Collection key={synced.collection} synced={synced} />
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
});

/** The shown Pocket's wallets, for the Windows' names. */
const walletRows = ({ model }: ChildData<typeof Pages.Wallets>) => model.rows;

const Named = View.make(Pages.PocketLive, ({ children }) => {
  const rows = useChild(children.wallets, walletRows) ?? [];
  const replicas = use(ReplicasAt);
  return (
    <WalletsAt value={new Map(rows.map(({ row }) => [row.id, row.name]))}>
      {replicas && <Instances instance={replicas} />}
    </WalletsAt>
  );
});

export function SyncPanel({
  accounts,
  pocket,
}: {
  readonly accounts: ReadonlyArray<Account>;
  readonly pocket: Handle<typeof Pages.PocketLive>;
}) {
  return (
    <section aria-labelledby="replica-sync" className="min-w-0 space-y-3">
      <div className="space-y-1">
        <h2
          id="replica-sync"
          className="text-xs font-medium tracking-wide text-muted-foreground uppercase"
        >
          Sync
        </h2>
        <p className="max-w-[48ch] text-sm text-pretty text-muted-foreground">
          A wallet's entries sync while its Window is open. Turned off, it
          closes 8 seconds later; its entries stay.
        </p>
      </div>
      <AccountsAt value={accounts}>
        <Named instance={pocket} />
      </AccountsAt>
    </section>
  );
}
