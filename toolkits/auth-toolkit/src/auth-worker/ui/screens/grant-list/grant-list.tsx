import { AppWindow, Check } from 'lucide-react';

import { ActionButton } from '../action-button';
import { DetailList, DisclosureItem, DisclosureList } from '../disclosure-list';
import { describeScope, type ScopeDescriptions } from '../scope-list';

export interface GrantView {
  clientId: string;
  name: string;
  scopes: ReadonlyArray<string>;
  grantedAt: Date;
}

const calendar = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

const permissions = (count: number) =>
  count === 1 ? '1 permission' : `${count} permissions`;

function GrantRow({
  grant,
  descriptions,
  onRevoke,
}: {
  grant: GrantView;
  descriptions: ScopeDescriptions;
  onRevoke: () => Promise<unknown>;
}) {
  return (
    <DisclosureItem
      value={`grant:${grant.clientId}`}
      icon={<AppWindow />}
      title={grant.name}
      titleHint={grant.clientId}
      aside={permissions(grant.scopes.length)}
    >
      <ul className="flex flex-col gap-1.5 text-sm">
        {grant.scopes.map((scope) => (
          <li key={scope} className="flex items-center gap-2">
            <Check aria-hidden className="size-3.5 shrink-0 text-primary" />
            {describeScope(scope, descriptions)}
          </li>
        ))}
      </ul>
      <DetailList details={[['Allowed', calendar.format(grant.grantedAt)]]} />
      <ActionButton
        variant="destructive"
        size="sm"
        className="self-start"
        action={onRevoke}
      >
        Revoke access
      </ActionButton>
    </DisclosureItem>
  );
}

export function GrantList({
  grants,
  descriptions,
  onRevoke,
  open,
  onOpenChange,
}: {
  open: string | null;
  onOpenChange: (value: string | null) => void;
  grants: ReadonlyArray<GrantView>;
  descriptions: ScopeDescriptions;
  onRevoke: (clientId: string) => Promise<unknown>;
}) {
  if (grants.length === 0) return null;
  return (
    <section aria-labelledby="grants-heading" className="flex flex-col gap-3">
      <h2 id="grants-heading" className="text-sm font-medium">
        Apps with access
      </h2>
      <DisclosureList open={open} onOpenChange={onOpenChange}>
        {grants.map((grant) => (
          <GrantRow
            key={grant.clientId}
            grant={grant}
            descriptions={descriptions}
            onRevoke={() => onRevoke(grant.clientId)}
          />
        ))}
      </DisclosureList>
    </section>
  );
}
