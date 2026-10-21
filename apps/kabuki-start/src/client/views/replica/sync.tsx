import { useSyncExternalStore } from 'react';
import { View } from '@kestack/kabuki/react';
import { Pages } from '../../../shared/pages/index.ts';

/*
 * The Sync panel: each Instance running, by its Account, whether this tab
 * leads it and may fetch, and who holds it; one nobody holds counts down
 * to when it stops.
 */

const tick = (changed: () => void) => {
  const timer = setInterval(changed, 250);
  return () => clearInterval(timer);
};

/** The time now, drawn again four times a second; 0 on the server and while hydrating. */
const useNow = () => useSyncExternalStore(tick, Date.now, () => 0);

/** Who holds an Instance, in the page's words: a holder is the id of the Query or the name of the Action. */
const holderName = (holder: string) =>
  holder.includes('/Peek')
    ? 'Peek'
    : holder.includes('/pocket')
      ? 'Your Pocket'
      : 'a write';

function Countdown({ until }: { readonly until: number }) {
  const now = useNow();
  if (now === 0) return null;
  return (
    <span className="tabular-nums">
      stops in {Math.max(0, Math.ceil((until - now) / 1000))}s
    </span>
  );
}

export const SyncView = View.make(Pages.SyncLive, ({ root, model }) => (
  <aside {...root} aria-label="Sync" className="space-y-3">
    <div className="space-y-1">
      <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        Sync
      </h2>
      <p className="text-sm text-muted-foreground">
        An Instance runs while something reads it.
      </p>
    </div>
    {model.instances.length === 0 ? (
      <p className="text-sm text-muted-foreground">None running.</p>
    ) : (
      <ul className="space-y-2">
        {model.instances.map((running) => {
          const email =
            model.accounts.find(({ id }) => id === running.key)?.email ??
            running.key;
          const holders = [...new Set(running.holders.map(holderName))];
          return (
            <li
              key={`${running.replica}·${running.key}`}
              className="space-y-1 rounded-lg border border-border bg-card p-3 text-sm"
            >
              <p className="truncate font-medium">{email}</p>
              <p className="text-muted-foreground">
                {running.role === 'leading' ? 'Leading' : 'Following'} · gate{' '}
                <span className={running.gate ? 'text-positive' : ''}>
                  {running.gate ? 'open' : 'closed'}
                </span>
              </p>
              <p className="text-muted-foreground">
                {running.lingeringUntil !== null ? (
                  <Countdown until={running.lingeringUntil} />
                ) : (
                  `held by ${holders.join(' and ')}`
                )}
              </p>
            </li>
          );
        })}
      </ul>
    )}
  </aside>
));
