import { useSyncExternalStore } from 'react';

/*
 * The accounts list: every signed-in Account, the active one marked, and
 * how its Pocket syncs, in a word: syncing while it is the active one, on
 * this device only otherwise, and counting down once nothing reads it.
 * Picking one shows its Pocket. A row down the side on a wide screen, a
 * strip above the Pocket on a narrow one.
 */

interface Running {
  readonly replica: string;
  readonly key: string;
  readonly role: 'leading' | 'following';
  readonly gate: boolean;
  readonly lingeringUntil: number | null;
}

const tick = (changed: () => void) => {
  const timer = setInterval(changed, 250);
  return () => clearInterval(timer);
};

/** The time now, drawn again four times a second; 0 on the server and while hydrating. */
const useNow = () => useSyncExternalStore(tick, Date.now, () => 0);

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

function Status({ running }: { readonly running: Running | undefined }) {
  const [tone, text] =
    running === undefined
      ? (['closed', 'Not open'] as const)
      : running.lingeringUntil !== null
        ? (['stopping', <Countdown until={running.lingeringUntil} />] as const)
        : !running.gate
          ? (['local', 'On this device only'] as const)
          : running.role === 'leading'
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

export function AccountsList({
  accounts,
  active,
  shown,
  instances,
  show,
  className = '',
}: {
  readonly accounts: ReadonlyArray<{
    readonly id: string;
    readonly email: string;
  }>;
  readonly active: string;
  readonly shown: string;
  readonly instances: ReadonlyArray<Running>;
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
          reads stops after 5 seconds.
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
              <Status
                running={instances.find(
                  (each) => each.replica === 'pocket' && each.key === id,
                )}
              />
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
