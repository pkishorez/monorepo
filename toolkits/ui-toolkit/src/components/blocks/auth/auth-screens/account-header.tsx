import { Avatar, AvatarFallback, AvatarImage } from '#components/ui/avatar';

import { ActionButton, type Action } from '../action-button';
import { BrandLink, MaskedEmail, type Branding } from '../screen-frame';

export interface UserView {
  name: string;
  email: string;
  image?: string | null | undefined;
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');

export function AccountHeader({
  branding,
  user,
  onSignOut,
}: {
  branding: Branding;
  user: UserView;
  onSignOut: Action;
}) {
  const name = user.name || user.email;
  return (
    <header className="flex flex-col gap-6">
      <BrandLink branding={branding} />
      <div className="flex items-center gap-4">
        <Avatar className="size-12">
          {user.image ? <AvatarImage src={user.image} alt="" /> : null}
          <AvatarFallback>{initials(name)}</AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h1 className="truncate text-xl font-semibold tracking-tight">
            {user.name || <MaskedEmail email={user.email} />}
          </h1>
          {user.name ? (
            <p className="truncate text-sm text-muted-foreground">
              <MaskedEmail email={user.email} />
            </p>
          ) : null}
        </div>
        <ActionButton
          variant="outline"
          size="sm"
          className="shrink-0"
          action={onSignOut}
        >
          Sign out
        </ActionButton>
      </div>
    </header>
  );
}
