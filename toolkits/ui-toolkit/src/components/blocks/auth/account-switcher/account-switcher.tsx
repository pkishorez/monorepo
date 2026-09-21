import { ChevronDown, LogOut, Plus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Avatar, AvatarFallback, AvatarImage } from '#components/ui/avatar';
import { Badge } from '#components/ui/badge';
import { Button } from '#components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#components/ui/dropdown-menu';
import { Spinner } from '#components/ui/spinner';
import { cn } from '#lib/utils';

import { MaskedEmail } from '../email-privacy';

export interface SignedInAccount {
  id: string;
  name: string;
  email: string;
  image?: string | null | undefined;
}

/** The browser's Signed-in Accounts: who is active, who else is signed in,
 * and what the User may do about it. */
export interface AccountsView {
  active: SignedInAccount;
  others: ReadonlyArray<SignedInAccount>;
  /** False once the deployment's account limit is reached. */
  canAdd: boolean;
  onSwitch: (id: string) => Promise<unknown>;
  onAdd: () => void;
  /** Signs out the Active Account only. */
  onSignOut: () => Promise<unknown>;
  onSignOutAll: () => Promise<unknown>;
}

const initials = (account: SignedInAccount) =>
  (account.name || account.email)
    .split(/[\s@]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');

function AccountAvatar({
  account,
  className,
}: {
  account: SignedInAccount;
  className?: string;
}) {
  return (
    <Avatar className={cn('size-6 text-[0.6rem]', className)}>
      {account.image ? <AvatarImage src={account.image} alt="" /> : null}
      <AvatarFallback>{initials(account)}</AvatarFallback>
    </Avatar>
  );
}

function AccountIdentity({ account }: { account: SignedInAccount }) {
  return (
    <span className="flex min-w-0 flex-1 flex-col">
      {account.name ? (
        <span className="truncate text-sm">{account.name}</span>
      ) : null}
      <span
        className={cn(
          'truncate',
          account.name ? 'text-xs text-muted-foreground' : 'text-sm',
        )}
      >
        <MaskedEmail email={account.email} />
      </span>
    </span>
  );
}

const failureMessage = (cause: unknown) =>
  cause instanceof Error && cause.message
    ? cause.message
    : 'That did not work. Try again.';

export function AccountSwitcher({ accounts }: { accounts: AccountsView }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const { active, others } = accounts;

  const run = (key: string, action: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(key);
    action()
      .then(() => setOpen(false))
      .catch((cause: unknown) => toast.error(failureMessage(cause)))
      .finally(() => setBusy(null));
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            aria-label={
              others.length > 0
                ? `Signed in as ${active.email} and ${others.length} more. Switch account`
                : `Signed in as ${active.email}. Account menu`
            }
            className="h-8 max-w-64 gap-1.5 px-1.5 text-muted-foreground hover:text-foreground"
          />
        }
      >
        <AccountAvatar account={active} />
        <span className="hidden max-w-40 truncate text-xs sm:inline">
          <MaskedEmail email={active.email} />
        </span>
        {others.length > 0 ? (
          <Badge variant="secondary" className="h-4 px-1.5 text-[0.65rem]">
            +{others.length}
          </Badge>
        ) : null}
        <ChevronDown aria-hidden className="size-3.5 shrink-0 opacity-70" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuGroup>
          <div className="flex items-center gap-3 px-2 py-2">
            <AccountAvatar account={active} className="size-9 text-xs" />
            <AccountIdentity account={active} />
          </div>
          <DropdownMenuItem
            closeOnClick={false}
            disabled={busy !== null}
            onClick={() => run('sign-out', accounts.onSignOut)}
          >
            {busy === 'sign-out' ? <Spinner /> : <LogOut />}
            Sign out
          </DropdownMenuItem>
        </DropdownMenuGroup>
        {others.length > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>Switch to</DropdownMenuLabel>
              {others.map((account) => (
                <DropdownMenuItem
                  key={account.id}
                  closeOnClick={false}
                  disabled={busy !== null}
                  className="gap-3 py-2"
                  onClick={() =>
                    run(account.id, () => accounts.onSwitch(account.id))
                  }
                >
                  {busy === account.id ? (
                    <span className="flex size-7 shrink-0 items-center justify-center">
                      <Spinner />
                    </span>
                  ) : (
                    <AccountAvatar account={account} className="size-7" />
                  )}
                  <AccountIdentity account={account} />
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </>
        ) : null}
        <DropdownMenuSeparator />
        {accounts.canAdd ? (
          <DropdownMenuItem disabled={busy !== null} onClick={accounts.onAdd}>
            <Plus />
            Add another account
          </DropdownMenuItem>
        ) : (
          <p className="px-2 py-1.5 text-xs text-pretty text-muted-foreground">
            You have reached the account limit. Sign out of one to add another.
          </p>
        )}
        {others.length > 0 ? (
          <DropdownMenuItem
            variant="destructive"
            closeOnClick={false}
            disabled={busy !== null}
            className="mt-2"
            onClick={() => run('sign-out-all', accounts.onSignOutAll)}
          >
            {busy === 'sign-out-all' ? <Spinner /> : <LogOut />}
            Sign out of all accounts
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
