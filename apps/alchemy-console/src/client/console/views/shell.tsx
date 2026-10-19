import type { ReactNode } from 'react';
import { Router } from '@kestack/kabuki/routing';
import {
  Avatar,
  AvatarFallback,
} from '@kestack/web-platform/components/avatar';
import { Button } from '@kestack/web-platform/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@kestack/web-platform/components/dropdown-menu';
import {
  ChevronsUpDownIcon,
  LogOutIcon,
  SettingsIcon,
  UserPlusIcon,
} from '@kestack/web-platform/components/lucide';
import { Skeleton } from '@kestack/web-platform/components/skeleton';
import { router } from '../../../shared/pages/index.ts';
import { Brand } from './brand.tsx';

/*
 * What is around every page of a signed-in member: a header with the
 * Account menu, and the page. The header is the same height in every state,
 * so nothing below it moves when the menu fills in.
 */

interface Account {
  readonly id: string;
  readonly email: string;
  readonly name: string;
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');

export interface AccountMenuProps {
  readonly member: { readonly userId: string } & Omit<Account, 'id'>;
  /** The other accounts signed in on this browser. */
  readonly others: ReadonlyArray<Account>;
  readonly busy: boolean;
  readonly onSwitch: (userId: string) => void;
  readonly onAdd: () => void;
  readonly onSignOut: () => void;
}

function AccountMenu({
  member,
  others,
  busy,
  onSwitch,
  onAdd,
  onSignOut,
}: AccountMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            className="h-10 gap-2 px-1.5 sm:px-2"
            aria-label={`Account: ${member.name}`}
          />
        }
      >
        <Avatar size="sm">
          <AvatarFallback>{initials(member.name)}</AvatarFallback>
        </Avatar>
        <span className="hidden max-w-40 truncate sm:inline">
          {member.name}
        </span>
        <ChevronsUpDownIcon className="text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex flex-col gap-0.5">
            <span className="truncate text-sm font-medium text-foreground">
              {member.name}
            </span>
            <span className="truncate">{member.email}</span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        {others.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>Switch to</DropdownMenuLabel>
              {others.map((account) => (
                <DropdownMenuItem
                  key={account.id}
                  disabled={busy}
                  onClick={() => onSwitch(account.id)}
                >
                  <Avatar size="sm">
                    <AvatarFallback>{initials(account.name)}</AvatarFallback>
                  </Avatar>
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate">{account.name}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {account.email}
                    </span>
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          render={<Router.Link to={router.Console.Settings()} />}
        >
          <SettingsIcon />
          Settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={busy} onClick={onAdd}>
          <UserPlusIcon />
          Add account
        </DropdownMenuItem>
        <DropdownMenuItem disabled={busy} onClick={onSignOut}>
          <LogOutIcon />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Header({
  children,
  home = false,
}: {
  readonly children: ReactNode;
  /** The brand links home, once someone is signed in. */
  readonly home?: boolean;
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 supports-backdrop-filter:backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4">
        {home ? (
          <Router.Link
            to={router.Console.Welcome()}
            className="rounded-sm focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <Brand />
          </Router.Link>
        ) : (
          <Brand />
        )}
        {children}
      </div>
    </header>
  );
}

export function Shell({
  menu,
  children,
}: {
  readonly menu: AccountMenuProps;
  readonly children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <Header home>
        <AccountMenu {...menu} />
      </Header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4">{children}</main>
    </div>
  );
}

/** The Shell while who is signed in is being found out: shaped like it, so nothing moves when it is. */
export function ShellSkeleton() {
  return (
    <div className="flex min-h-dvh flex-col" aria-busy>
      <Header>
        <Skeleton className="h-8 w-8 rounded-full sm:w-32" />
      </Header>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 px-4 py-16 sm:py-24">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-5 w-full max-w-md" />
      </main>
    </div>
  );
}
