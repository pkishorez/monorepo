import { cn } from 'cn';
import { LogOut, UserPlus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { ComponentProps } from 'react';

import { Avatar, AvatarFallback, AvatarImage } from '#components/avatar';
import { Button } from '#components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#components/dropdown-menu';
import { Spinner } from '#components/spinner';

/*
 * What the Account Switcher draws, from plain data: the slot in the header,
 * and in it the "Sign in" button, the avatar of an Account still being
 * checked, or the Account menu. The menu is the Auth Worker's: on top, on
 * its own surface, the Active Account and a quiet "Sign out" for it alone;
 * then the other Accounts to switch to; then adding one, and signing out of
 * them all.
 *
 * A Base UI Menu: arrow keys, Home/End and typing a name move through the
 * items; Escape closes and focus goes back to the avatar. An action stays
 * open on its item, busy, until it is done. An Account Switch shows only
 * once it has been under way a moment: a quick one shows nothing.
 */

export interface Account {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly image: string | null;
}

/**
 * The avatar's 44px target, checking or signed in, and the "Sign in"
 * button's width only when signed out: no gap beside an avatar. Its width
 * moves between the two with a short ease-out, so what sits beside it
 * glides rather than jumps; at once under reduced motion. What it holds is
 * right-aligned and clipped to it (with room for a focus ring), so the
 * button is uncovered as the slot widens.
 */
export function Slot({
  wide,
  className,
  ...props
}: ComponentProps<'div'> & { readonly wide: boolean }) {
  return (
    <div
      className={cn(
        'flex h-11 shrink-0 items-center justify-end [clip-path:inset(-6px)] transition-[width] duration-200 ease-out motion-reduce:transition-none',
        wide ? 'w-18' : 'w-11',
        className,
      )}
      {...props}
    />
  );
}

export function SignInButton({ onClick }: { readonly onClick: () => void }) {
  return (
    <Button
      size="sm"
      className="relative w-18 shrink-0 animate-in fade-in duration-200 before:absolute before:inset-x-0 before:-inset-y-1.5 motion-reduce:animate-none"
      onClick={onClick}
    >
      Sign in
    </Button>
  );
}

/** An Account's picture, or its first letter when it has none. */
export function Face({ account }: { readonly account: Account }) {
  return (
    <Avatar aria-hidden="true">
      {account.image ? (
        <AvatarImage src={account.image} alt="" referrerPolicy="no-referrer" />
      ) : null}
      <AvatarFallback className="font-medium">
        {(account.name.trim() || account.email).charAt(0).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
}

/** The 44px target the avatar sits in, pressed or not. */
const target =
  'relative grid size-11 place-items-center rounded-full outline-none transition-[scale] duration-150 ease-out focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100';

/** The Account last seen here, shown while the Auth Worker confirms it. */
export function Remembered({ account }: { readonly account: Account }) {
  return (
    <span
      role="img"
      aria-label={`Checking who is signed in. Last signed in as ${account.email}`}
      className="grid size-11 place-items-center"
    >
      <Face account={account} />
    </span>
  );
}

/** Name and email, each on one line, cut with … and whole in a title. */
export function Who({ account }: { readonly account: Account }) {
  return (
    <span className="min-w-0 flex-1">
      <span
        className="block truncate font-medium"
        title={account.name || account.email}
      >
        {account.name || account.email}
      </span>
      <span
        className="block truncate text-sm text-muted-foreground"
        title={account.email}
      >
        {account.email}
      </span>
    </span>
  );
}

// Items sit 6px inside the 12px-round popup, so they round at 6px.
const item =
  'min-h-11 gap-3 rounded-md px-2.5 py-1.5 text-[15px] transition-colors duration-150 focus:bg-muted data-disabled:pointer-events-auto data-disabled:opacity-100 data-disabled:text-muted-foreground/60 motion-reduce:transition-none';

const caption = 'px-2.5 pt-2 pb-1';

export function AccountMenu({
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
  const [open, setOpen] = useState(false);
  const full = accounts.length >= maxAccounts;
  const others = accounts.filter((account) => account.id !== active.id);
  const working = busy !== null || switching !== null;
  // Until a switch shows, the items look as they did, and do nothing.
  const disabled = working && switching?.shown !== false;
  const signingOut = busy === active.id && switching === null;

  // An action done, the menu has nothing more to show; one that failed stays to say why.
  const wasWorking = useRef(working);
  useEffect(() => {
    if (wasWorking.current && !working && failed === null) setOpen(false);
    wasWorking.current = working;
  }, [working, failed]);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        aria-label={`Accounts. Signed in as ${active.email}`}
        className={target}
      >
        <Face account={active} />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={6}
        className="w-[min(340px,calc(100vw-24px))] rounded-xl p-0"
      >
        <DropdownMenuGroup className="rounded-t-xl border-b border-border bg-muted px-1.5 pt-1.5 pb-2">
          <DropdownMenuLabel className={caption}>
            Signed in as
          </DropdownMenuLabel>
          <div className="flex items-center gap-3 py-1 pr-1 pl-2.5">
            <Face account={active} />
            <Who account={active} />
            <DropdownMenuItem
              closeOnClick={false}
              disabled={disabled}
              aria-busy={signingOut ? true : undefined}
              aria-label={`Sign out of ${active.email}`}
              onClick={() => onSignOut()}
              className="relative h-8 shrink-0 rounded-lg px-2.5 font-medium text-muted-foreground transition-[background-color,color,box-shadow] duration-150 before:absolute before:inset-x-0 before:-inset-y-1.5 focus:bg-popover focus:text-foreground focus:shadow-xs data-disabled:pointer-events-auto data-disabled:opacity-100 data-disabled:text-muted-foreground/60 motion-reduce:transition-none"
            >
              {signingOut ? (
                <>
                  <Spinner />
                  Signing out…
                </>
              ) : (
                'Sign out'
              )}
            </DropdownMenuItem>
          </div>
        </DropdownMenuGroup>
        <div className="p-1.5">
          {others.length > 0 ? (
            <>
              <DropdownMenuGroup>
                <DropdownMenuLabel className={caption}>
                  Switch account
                </DropdownMenuLabel>
                {others.map((account) => {
                  const spinning =
                    switching?.shown === true && switching.id === account.id;
                  return (
                    <DropdownMenuItem
                      key={account.id}
                      label={account.name || account.email}
                      aria-label={`Switch to ${account.email}`}
                      closeOnClick={false}
                      disabled={disabled}
                      aria-busy={spinning ? true : undefined}
                      onClick={() => onSwitch(account.id)}
                      className={cn(
                        item,
                        spinning &&
                          'bg-muted text-foreground data-disabled:text-foreground',
                      )}
                    >
                      <Face account={account} />
                      <Who account={account} />
                      {spinning ? (
                        <Spinner className="text-muted-foreground" />
                      ) : null}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuGroup>
              <DropdownMenuSeparator className="-mx-1.5 my-1.5" />
            </>
          ) : null}
          {full ? (
            <p className="flex min-h-11 items-center gap-3 px-2.5 py-1.5 text-sm text-muted-foreground">
              <UserPlus aria-hidden="true" className="size-4 shrink-0" />
              This browser holds {maxAccounts} accounts, the most it can. Sign
              out of one to add another.
            </p>
          ) : (
            <DropdownMenuItem
              disabled={disabled}
              onClick={() => onAdd()}
              className={item}
            >
              <UserPlus aria-hidden="true" className="text-muted-foreground" />
              Add another account
            </DropdownMenuItem>
          )}
          {others.length > 0 ? (
            <DropdownMenuItem
              variant="destructive"
              closeOnClick={false}
              disabled={disabled}
              aria-busy={busy === 'all' ? true : undefined}
              onClick={() => onSignOutAll()}
              className={cn(
                item,
                'data-[variant=destructive]:data-disabled:text-muted-foreground/60 data-[variant=destructive]:data-disabled:*:[svg]:text-muted-foreground/60',
              )}
            >
              {busy === 'all' ? <Spinner /> : <LogOut aria-hidden="true" />}
              {busy === 'all'
                ? 'Signing out of all accounts…'
                : 'Sign out of all accounts'}
            </DropdownMenuItem>
          ) : null}
          {failed !== null ? (
            <p
              role="alert"
              className="px-2.5 pt-1 pb-1.5 text-sm text-pretty text-destructive"
            >
              {failed}
            </p>
          ) : null}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
