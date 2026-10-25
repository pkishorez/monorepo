import { cn } from 'cn';
import { Check, LogOut, UserPlus } from 'lucide-react';

import { Spinner } from '#components/spinner';
import { type Account, Face, Who } from './menu.tsx';

/*
 * The Account menu as a list, for a sheet a finger opens, such as a
 * Drawer: the Active Account, checked, with "Sign out" for it alone; the
 * other Accounts, each a row that switches to it; then adding one, and
 * signing out of them all. Rows are 56px, set apart by hairlines, and an
 * action shows on its row, busy, until it is done.
 */

const row =
  'flex min-h-14 w-full items-center gap-3 px-1 text-left text-[15px] transition-[background-color,transform] duration-150 active:scale-[0.99] active:bg-muted/60 disabled:pointer-events-none disabled:text-muted-foreground/60 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

export function AccountList({
  active,
  accounts,
  maxAccounts,
  busy,
  switching,
  failed,
  onSwitch,
  onAdd,
  onSignOut,
  onSignOutAll,
}: {
  readonly active: Account;
  readonly accounts: ReadonlyArray<Account>;
  readonly maxAccounts: number;
  /** The action under way: an Account's id, or `all`. */
  readonly busy: string | null;
  /** The Account Switch under way, and whether it has been long enough to show. */
  readonly switching: { readonly id: string; readonly shown: boolean } | null;
  /** Why the last action failed. */
  readonly failed: string | null;
  readonly onSwitch: (id: string) => void;
  readonly onAdd: () => void;
  readonly onSignOut: () => void;
  readonly onSignOutAll: () => void;
}) {
  const full = accounts.length >= maxAccounts;
  const others = accounts.filter((account) => account.id !== active.id);
  const working = busy !== null || switching !== null;
  const disabled = working && switching?.shown !== false;
  const signingOut = busy === active.id && switching === null;
  return (
    <div className="flex flex-col gap-1 px-4 pt-1 pb-4 [&_[data-slot=avatar]]:size-10">
      <h2 className="px-1 pb-2 text-[17px] font-semibold">Accounts</h2>
      <div className="flex flex-col divide-y divide-border/70 border-y border-border/70">
        <div className="flex min-h-16 items-center gap-3 px-1">
          <Face account={active} />
          <Who account={active} />
          <Check aria-label="Signed in" className="size-4 shrink-0" />
        </div>
        {others.map((account) => {
          const spinning =
            switching?.shown === true && switching.id === account.id;
          return (
            <button
              key={account.id}
              type="button"
              aria-label={`Switch to ${account.email}`}
              aria-busy={spinning ? true : undefined}
              disabled={disabled}
              onClick={() => onSwitch(account.id)}
              className={cn(row, 'min-h-16')}
            >
              <Face account={account} />
              <Who account={account} />
              {spinning ? <Spinner className="text-muted-foreground" /> : null}
            </button>
          );
        })}
        {full ? (
          <p className="flex min-h-14 items-center gap-3 px-1 text-sm text-pretty text-muted-foreground">
            <UserPlus aria-hidden="true" className="size-4 shrink-0" />
            This browser holds {maxAccounts} accounts, the most it can. Sign out
            of one to add another.
          </p>
        ) : (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onAdd()}
            className={row}
          >
            <span className="grid size-10 place-items-center">
              <UserPlus
                aria-hidden="true"
                className="size-5 text-muted-foreground"
              />
            </span>
            Add another account
          </button>
        )}
        <button
          type="button"
          disabled={disabled}
          aria-busy={signingOut ? true : undefined}
          onClick={() => onSignOut()}
          className={row}
        >
          <span className="grid size-10 place-items-center">
            {signingOut ? (
              <Spinner />
            ) : (
              <LogOut
                aria-hidden="true"
                className="size-5 text-muted-foreground"
              />
            )}
          </span>
          {signingOut ? 'Signing out…' : `Sign out of ${active.email}`}
        </button>
        {others.length > 0 ? (
          <button
            type="button"
            disabled={disabled}
            aria-busy={busy === 'all' ? true : undefined}
            onClick={() => onSignOutAll()}
            className={cn(row, 'text-destructive')}
          >
            <span className="grid size-10 place-items-center">
              {busy === 'all' ? (
                <Spinner />
              ) : (
                <LogOut aria-hidden="true" className="size-5" />
              )}
            </span>
            {busy === 'all'
              ? 'Signing out of all accounts…'
              : 'Sign out of all accounts'}
          </button>
        ) : null}
      </div>
      {failed !== null ? (
        <p
          role="alert"
          className="px-1 pt-2 text-sm text-pretty text-destructive"
        >
          {failed}
        </p>
      ) : null}
    </div>
  );
}
