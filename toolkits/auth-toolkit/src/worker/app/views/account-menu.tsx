import { Menu } from '@base-ui/react/menu';
import { LogOut, UserPlus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { loginHref, type Account } from '../api/index.ts';
import { Avatar, Spinner, cx } from '../ui/index.ts';
import { useRoot } from './root.ts';

/*
 * The Account menu: at the top right of a signed-in page, after the Theme
 * toggle. On top, on its own surface, the Active Account and a quiet
 * "Sign out" for it alone. Then the other Accounts: choosing one makes it
 * the Active Account, here and in every First-Party app. Then adding one,
 * and signing out of them all. Signing out of another Account is
 * switching to it, then "Sign out".
 *
 * A Base UI Menu: arrow keys, Home/End and typing a name move through the
 * items; Escape closes and focus goes back to the avatar. An action stays
 * open on its item, busy, until it is done.
 */

// Items sit 6px inside the 12px-round popup, so they round at 6px.
const item =
  'flex min-h-11 w-full cursor-default select-none items-center gap-3 rounded-md px-2.5 py-1.5 text-left text-[15px] transition-colors duration-150 focus-visible:outline-offset-0 data-[highlighted]:bg-hover data-[disabled]:text-faint motion-reduce:transition-none';

const caption = 'px-2.5 pt-2 pb-1 text-xs font-medium text-muted-fg';

const rule = <Menu.Separator className="-mx-1.5 my-1.5 h-px bg-line" />;

/** Name and email, each on one line, cut with … and whole in a title. */
function Who({ account }: { account: Account }) {
  return (
    <span className="min-w-0 flex-1">
      <span
        className="block truncate font-medium"
        title={account.name || account.email}
      >
        {account.name || account.email}
      </span>
      <span
        className="block truncate text-sm text-muted-fg"
        title={account.email}
      >
        {account.email}
      </span>
    </span>
  );
}

export function AccountMenu({
  active,
  accounts,
  maxAccounts,
}: {
  active: Account;
  accounts: ReadonlyArray<Account>;
  maxAccounts: number;
}) {
  const root = useRoot();
  const [open, setOpen] = useState(false);
  const here =
    typeof window === 'undefined'
      ? '/'
      : window.location.pathname + window.location.search;
  const full = accounts.length >= maxAccounts;
  const others = accounts.filter((account) => account.id !== active.id);
  const busy = root.busy !== null;

  // An action done (or failed), the menu has nothing more to show.
  const wasBusy = useRef(busy);
  useEffect(() => {
    if (wasBusy.current && !busy) setOpen(false);
    wasBusy.current = busy;
  }, [busy]);

  return (
    <Menu.Root open={open} onOpenChange={setOpen}>
      <Menu.Trigger
        aria-label={`Accounts. Signed in as ${active.email}`}
        className="relative grid size-11 place-items-center rounded-full transition-[scale] duration-150 ease-out active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100"
      >
        <Avatar {...active} />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner
          side="bottom"
          align="end"
          sideOffset={6}
          collisionPadding={12}
        >
          <Menu.Popup className="w-[min(340px,calc(100vw-24px))] origin-[var(--transform-origin)] rounded-xl bg-surface shadow-(--shadow-overlay) outline-none transition-[opacity,scale] duration-150 ease-out data-[ending-style]:scale-[0.97] data-[ending-style]:opacity-0 data-[ending-style]:duration-100 data-[starting-style]:scale-[0.97] data-[starting-style]:opacity-0 motion-reduce:transition-none">
            <Menu.Group className="rounded-t-xl border-b border-line bg-muted px-1.5 pt-1.5 pb-2">
              <Menu.GroupLabel className={caption}>
                Signed in as
              </Menu.GroupLabel>
              <div className="flex items-center gap-3 py-1 pr-1 pl-2.5">
                <Avatar {...active} />
                <Who account={active} />
                <Menu.Item
                  closeOnClick={false}
                  disabled={busy}
                  aria-busy={root.busy === active.id ? true : undefined}
                  aria-label={`Sign out of ${active.email}`}
                  onClick={() => root.signOut(active)}
                  className="relative flex h-8 shrink-0 cursor-default select-none items-center gap-2 rounded-lg px-2.5 text-sm font-medium text-muted-fg transition-[background-color,color,box-shadow] duration-150 before:absolute before:inset-x-0 before:-inset-y-1.5 focus-visible:outline-offset-0 data-[highlighted]:bg-surface data-[highlighted]:text-fg data-[highlighted]:shadow-(--shadow-control) data-[disabled]:text-faint motion-reduce:transition-none"
                >
                  {root.busy === active.id ? (
                    <>
                      <Spinner />
                      Signing out…
                    </>
                  ) : (
                    'Sign out'
                  )}
                </Menu.Item>
              </div>
            </Menu.Group>
            <div className="p-1.5">
              {others.length > 0 ? (
                <>
                  <Menu.Group>
                    <Menu.GroupLabel className={caption}>
                      Switch account
                    </Menu.GroupLabel>
                    {others.map((account) => {
                      const switching = root.busy === account.id;
                      return (
                        <Menu.Item
                          key={account.id}
                          label={account.name || account.email}
                          aria-label={`Switch to ${account.email}`}
                          closeOnClick={false}
                          disabled={busy}
                          aria-busy={switching ? true : undefined}
                          onClick={() => root.switchTo(account)}
                          className={cx(
                            item,
                            switching &&
                              'bg-hover text-fg data-[disabled]:text-fg',
                          )}
                        >
                          <Avatar {...account} />
                          <Who account={account} />
                          {switching ? (
                            <Spinner className="text-muted-fg" />
                          ) : null}
                        </Menu.Item>
                      );
                    })}
                  </Menu.Group>
                  {rule}
                </>
              ) : null}
              {full ? (
                <p className="flex min-h-11 items-center gap-3 px-2.5 py-1.5 text-sm text-muted-fg">
                  <UserPlus aria-hidden="true" className="size-4 shrink-0" />
                  This browser holds {maxAccounts} accounts, the most it can.
                  Sign out of one to add another.
                </p>
              ) : (
                <Menu.LinkItem
                  href={loginHref(here, true)}
                  className={item}
                  closeOnClick
                >
                  <UserPlus
                    aria-hidden="true"
                    className="size-4 shrink-0 text-muted-fg"
                  />
                  Add another account
                </Menu.LinkItem>
              )}
              {others.length > 0 ? (
                <Menu.Item
                  closeOnClick={false}
                  disabled={busy}
                  aria-busy={root.busy === 'all' ? true : undefined}
                  onClick={root.signOutAll}
                  className={cx(item, 'text-danger')}
                >
                  {root.busy === 'all' ? (
                    <Spinner />
                  ) : (
                    <LogOut aria-hidden="true" className="size-4 shrink-0" />
                  )}
                  {root.busy === 'all'
                    ? 'Signing out of all accounts…'
                    : 'Sign out of all accounts'}
                </Menu.Item>
              ) : null}
            </div>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
