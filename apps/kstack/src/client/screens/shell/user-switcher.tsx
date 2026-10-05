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
import { toast } from '@kstackz/ui-toolkit/components/ui/sonner';
import {
  Check,
  ChevronsUpDown,
  LogOut,
  UserPlus,
} from '@kstackz/ui-toolkit/lucide';
import {
  addUser,
  signOut,
  switchUser,
  useApp,
} from '../../state/machine/index.ts';
import { type User, useOnline, useUser } from '../../state/session/index.ts';
import { LedgerMark } from '../parts/index.ts';

function UserAvatar(props: { readonly user: User }) {
  return (
    <Avatar size="sm">
      {props.user.image && <AvatarImage src={props.user.image} alt="" />}
      <AvatarFallback>{props.user.name.slice(0, 1)}</AvatarFallback>
    </Avatar>
  );
}

const add = () =>
  addUser().catch(() =>
    toast.error('Couldn’t start adding a user. Try again.'),
  );

/**
 * Ledger and whose Session is open, atop the Sidebar: it lists every User
 * signed in on this device to Switch User, Add User, or Sign Out the open
 * one. Both need the sign-in service, so they wait for the network.
 */
export function UserSwitcher() {
  const user = useUser();
  const app = useApp();
  const online = useOnline();
  const signedIn = app.kind === 'open' ? app.signedIn : [];
  // Remembered offline, the open User has no token to sign out with yet.
  const reached = online && app.kind === 'open' && app.user.token !== null;
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
        <DropdownMenuGroup>
          <DropdownMenuItem disabled={!online} onClick={add}>
            <UserPlus aria-hidden="true" />
            Add user
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!reached} onClick={signOut}>
            <LogOut aria-hidden="true" />
            <span className="truncate">Sign out {user.name}</span>
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
