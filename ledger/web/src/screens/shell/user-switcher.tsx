import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@kstackz/web-platform/components/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@kstackz/web-platform/components/dropdown-menu';
import { toast } from '@kstackz/web-platform/components/sonner';
import {
  Check,
  ChevronsUpDown,
  LogOut,
  UserPlus,
} from '@kstackz/web-platform/components/lucide';
import { useAccounts, useGate } from '../../app.ts';
import { type User, useUser } from '@ledger/core/session';
import { LedgerMark } from '../parts/index.ts';

function UserAvatar(props: { readonly user: User }) {
  return (
    <Avatar size="sm">
      {props.user.image && <AvatarImage src={props.user.image} alt="" />}
      <AvatarFallback>{props.user.name.slice(0, 1)}</AvatarFallback>
    </Avatar>
  );
}

// Each row in the menu: room enough to read and to tap.
const ROW = 'gap-2.5 px-2.5 py-2';

/**
 * Ledger and whose Session is open, atop the Sidebar: it lists every User
 * signed in on this device to Switch User, Add User, or Sign Out the open
 * one. Both need the sign-in service, so they wait for the network.
 */
export function UserSwitcher() {
  const user = useUser();
  const { current: account, all, add, switchTo, signOut } = useAccounts();
  const { online } = useGate();
  // Opened before the Backend answered, the open User has no token to sign
  // out with yet; and only the Backend can sign anyone out.
  const reached = online && account.token !== null;
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
      <DropdownMenuContent backdrop className="min-w-64 p-2">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="px-2.5 pb-2">
            Signed in on this device
          </DropdownMenuLabel>
          {all.map(({ user: other }) => (
            <DropdownMenuItem
              className={ROW}
              key={other.id}
              onClick={() => switchTo(other.id)}
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
          <DropdownMenuItem
            className={ROW}
            disabled={!online}
            onClick={() =>
              add().catch(() =>
                toast.error('Couldn’t start adding a user. Try again.'),
              )
            }
          >
            <UserPlus aria-hidden="true" />
            Add user
          </DropdownMenuItem>
          <DropdownMenuItem
            className={ROW}
            disabled={!reached}
            onClick={() => void signOut()}
          >
            <LogOut aria-hidden="true" />
            <span className="truncate">Sign out {user.name}</span>
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
