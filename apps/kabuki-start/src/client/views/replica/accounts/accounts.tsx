import { createContext, use, useSyncExternalStore } from 'react';
import { useChildren, View } from '@kestack/kabuki/react';
import type { Handle } from '@kestack/kabuki/react';
import { Pages } from '../../../../shared/pages/index.ts';

/*
 * The accounts list: every signed-in Account, the active one marked, and
 * how its Pocket syncs, in a word: syncing while it is the active one, on
 * this device only otherwise, and counting down once nothing reads it.
 * Picking one shows its Pocket. A row down the side on a wide screen, a
 * strip above the Pocket on a narrow one.
 *
 * How an Account's Pocket syncs is read where it is kept: whether it runs
 * and when it stops in the Replicas actor's Model, whether it leads and its
 * Gate in its Instance's own. The root page's View hands Replicas down.
 */

/** The Replicas actor the root page places, for the statuses to read. */
export const ReplicasAt = createContext<
  Handle<typeof Pages.ReplicasLive> | undefined
>(undefined);

const AccountAt = createContext('');

const tick = (changed: () => void) => {
  const timer = setInterval(changed, 250);
  return () => clearInterval(timer);
};

/** The time now, drawn again four times a second; 0 on the server and while hydrating. */
export const useNow = () => useSyncExternalStore(tick, Date.now, () => 0);

function Countdown({ until }: { readonly until: number }) {
  const now = useNow();
  if (now === 0) return <>Stopping</>;
  return (
    <span className="tabular-nums">
      Stops in {Math.max(0, Math.ceil((until - now) / 1000))}s
    </span>
  );
}

const DOT = {
  syncing: 'bg-positive',
  local: 'bg-muted-foreground',
  stopping: 'bg-muted-foreground motion-safe:animate-pulse',
  closed: 'border border-muted-foreground',
} as const;

function Status({
  gcAt,
  gate,
  leading,
}: {
  /** `undefined` while it is not running. */
  readonly gcAt: number | null | undefined;
  readonly gate: boolean;
  readonly leading: boolean;
}) {
  const [tone, text] =
    gcAt === undefined
      ? (['closed', 'Not open'] as const)
      : gcAt !== null
        ? (['stopping', <Countdown until={gcAt} />] as const)
        : !gate
          ? (['local', 'On this device only'] as const)
          : leading
            ? (['syncing', 'Syncing'] as const)
            : (['syncing', 'Syncing in another tab'] as const);
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span
        aria-hidden
        className={`size-1.5 shrink-0 rounded-full ${DOT[tone]}`}
      />
      {text}
    </span>
  );
}

/** One Account's Pocket as Replicas runs it. */
const Running = View.make(Pages.ReplicasLive, ({ model, children }) => {
  const account = use(AccountAt);
  const own = useChildren(children.pocket).find(
    (each) => each.model.key === account,
  );
  const running = model.instances.find(
    (each) => each.replica === 'pocket' && each.key === account,
  );
  return (
    <Status
      gcAt={running?.gcAt}
      gate={own?.model.gate ?? false}
      leading={own?.state._tag === 'Leading'}
    />
  );
});

function AccountStatus({ account }: { readonly account: string }) {
  const replicas = use(ReplicasAt);
  if (replicas === undefined)
    return <Status gcAt={undefined} gate={false} leading={false} />;
  return (
    <AccountAt value={account}>
      <Running instance={replicas} />
    </AccountAt>
  );
}

export function AccountsList({
  accounts,
  active,
  shown,
  show,
  className = '',
}: {
  readonly accounts: ReadonlyArray<{
    readonly id: string;
    readonly email: string;
  }>;
  readonly active: string;
  readonly shown: string;
  readonly show: (account: string) => void;
  readonly className?: string;
}) {
  return (
    <aside
      aria-labelledby="replica-accounts"
      className={`min-w-0 space-y-3 ${className}`}
    >
      <div className="space-y-1">
        <h2
          id="replica-accounts"
          className="text-xs font-medium tracking-wide text-muted-foreground uppercase"
        >
          Accounts
        </h2>
        <p className="max-w-[48ch] text-sm text-pretty text-muted-foreground">
          The active account syncs. Others read from this device. One nothing
          reads stops after 8 seconds.
        </p>
      </div>
      <ul className="-mx-5 flex snap-x gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] md:mx-0 md:flex-col md:overflow-visible md:px-0">
        {accounts.map(({ id, email }) => (
          <li key={id} className="shrink-0 snap-start md:shrink">
            <button
              type="button"
              aria-pressed={id === shown}
              onClick={() => show(id)}
              className="flex min-h-11 w-56 touch-manipulation flex-col items-start gap-1 rounded-lg border border-border bg-card px-3 py-2.5 text-left transition-[border-color,background-color] duration-150 hover:border-foreground/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:bg-muted aria-pressed:border-foreground/60 aria-pressed:bg-muted/60 motion-reduce:transition-none md:w-full"
            >
              <span className="flex w-full items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {email}
                </span>
                {id === active && (
                  <span className="shrink-0 rounded-sm bg-foreground px-1.5 py-px text-[0.6875rem] font-medium text-background">
                    Active
                  </span>
                )}
              </span>
              <AccountStatus account={id} />
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
