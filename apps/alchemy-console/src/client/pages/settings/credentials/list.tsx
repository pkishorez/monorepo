import { Button } from '@kestack/web-platform/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@kestack/web-platform/components/dropdown-menu';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@kestack/web-platform/components/empty';
import {
  EllipsisIcon,
  PencilIcon,
  Trash2Icon,
} from '@kestack/web-platform/components/lucide';
import { Skeleton } from '@kestack/web-platform/components/skeleton';
import type {
  CredentialSummary,
  Provider,
} from '../../../../shared/contracts/credential/index.ts';

/*
 * The credentials, grouped by provider, each row its name, the account its
 * provider confirmed, and a menu to rename or remove it. Every state is
 * drawn at the height of the rows it waits for, so nothing below moves.
 */

const GROUPS: ReadonlyArray<{
  readonly provider: Provider;
  readonly label: string;
}> = [
  { provider: 'cloudflare', label: 'Cloudflare' },
  { provider: 'aws', label: 'AWS' },
];

/** Where the credential's keys reach, as its provider confirmed. */
const accountOf = (credential: CredentialSummary) =>
  credential.provider === 'cloudflare'
    ? `${credential.accountName ?? 'Account'} · ${credential.accountId.slice(0, 6)}…${credential.accountId.slice(-4)}`
    : `Account ${credential.accountId} · ${credential.region ?? ''}`;

const ROW = 'flex min-h-16 items-center gap-3 px-4 py-3';

function Row({
  credential,
  onRename,
  onRemove,
}: {
  readonly credential: CredentialSummary;
  readonly onRename: () => void;
  readonly onRemove: () => void;
}) {
  return (
    <li className={ROW}>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate font-medium">{credential.name}</span>
        <span className="truncate text-sm text-muted-foreground tabular-nums">
          {accountOf(credential)}
        </span>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Actions for ${credential.name}`}
            />
          }
        >
          <EllipsisIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem onClick={onRename}>
            <PencilIcon />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={onRemove}>
            <Trash2Icon />
            Remove
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

export function CredentialGroups({
  credentials,
  onRename,
  onRemove,
}: {
  readonly credentials: ReadonlyArray<CredentialSummary>;
  readonly onRename: (credentialId: string) => void;
  readonly onRemove: (credentialId: string) => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      {GROUPS.map(({ provider, label }) => {
        const mine = credentials.filter((c) => c.provider === provider);
        if (mine.length === 0) return null;
        const id = `credentials-${provider}`;
        return (
          <section
            key={provider}
            aria-labelledby={id}
            className="flex flex-col gap-2"
          >
            <h3 id={id} className="text-sm font-medium text-muted-foreground">
              {label}
            </h3>
            <ul className="divide-y divide-border rounded-lg border border-border">
              {mine.map((credential) => (
                <Row
                  key={credential.credentialId}
                  credential={credential}
                  onRename={() => onRename(credential.credentialId)}
                  onRemove={() => onRemove(credential.credentialId)}
                />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

export function NoCredentials({ onAdd }: { readonly onAdd: () => void }) {
  return (
    <Empty className="rounded-lg border border-dashed border-border">
      <EmptyHeader>
        <EmptyTitle>No credentials yet</EmptyTitle>
        <EmptyDescription>
          Add a Cloudflare API token or AWS keys, and your projects can deploy
          with them.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button onClick={onAdd}>Add credential</Button>
      </EmptyContent>
    </Empty>
  );
}

/** The list while it is on the way: one group's heading and two rows. */
export function CredentialsSkeleton() {
  return (
    <div className="flex flex-col gap-2" aria-busy>
      <Skeleton className="h-5 w-24" />
      <div className="divide-y divide-border rounded-lg border border-border">
        {[0, 1].map((n) => (
          <div key={n} className={ROW}>
            <div className="flex flex-1 flex-col gap-1.5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-48" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
