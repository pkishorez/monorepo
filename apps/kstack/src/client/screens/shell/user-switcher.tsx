import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@kstackz/ui-toolkit/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@kstackz/ui-toolkit/components/ui/dropdown-menu';
import {
  Check,
  ChevronsUpDown,
  ExternalLink,
} from '@kstackz/ui-toolkit/lucide';
import { AUTH_URL, switchUser, useApp } from '../../state/machine/index.ts';
import { type User, useUser } from '../../state/session/index.ts';
import { LedgerMark } from '../parts/index.ts';

function UserAvatar(props: { readonly user: User }) {
  return (
    <Avatar size="sm">
      {props.user.image && <AvatarImage src={props.user.image} alt="" />}
      <AvatarFallback>{props.user.name.slice(0, 1)}</AvatarFallback>
    </Avatar>
  );
}

/**
 * Ledger and whose Session is open, atop the Sidebar: it lists every User
 * signed in on this device to Switch User, and goes to Manage Google
 * Accounts for anything else.
 */
export function UserSwitcher() {
  const user = useUser();
  const app = useApp();
  const signedIn = app.kind === 'open' ? app.signedIn : [];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        data-sidebar-item=""
        className="focus-ring flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      >
        <LedgerMark className="size-7" />
        <span className="grid min-w-0 flex-1 leading-tight">
          <span className="truncate text-sm font-medium">Ledger</span>
          <span className="truncate text-xs text-muted-foreground">
            {user.name}
          </span>
        </span>
        <ChevronsUpDown
          className="size-4 text-muted-foreground"
          aria-hidden="true"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Signed in on this device</DropdownMenuLabel>
          {signedIn.map(({ user: other }) => (
            <DropdownMenuItem
              key={other.id}
              onClick={() => switchUser(other.id)}
            >
              <UserAvatar user={other} />
              <span className="grid min-w-0 flex-1 leading-tight">
                <span className="truncate">{other.name}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {other.email}
                </span>
              </span>
              {other.id === user.id && (
                <Check className="size-4" aria-label="Open now" />
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          render={<a href={AUTH_URL} target="_blank" rel="noopener" />}
        >
          <ExternalLink aria-hidden="true" />
          Manage Google accounts
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
