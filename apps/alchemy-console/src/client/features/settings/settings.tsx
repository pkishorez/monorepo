import { useState } from 'react';
import { Button } from 'kui-toolkit/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from 'kui-toolkit/components/ui/dropdown-menu';
import {
  Cloud,
  EllipsisVertical,
  KeyRound,
  Pencil,
  Plus,
  Trash2,
} from 'kui-toolkit/lucide';
import { QueryError, ListSkeleton } from '../query-feedback/index.ts';
import {
  CredentialDialog,
  formatAccount,
  providerLabel,
  useCredentials,
  type Credential,
  type CredentialAction,
} from '../credentials/index.ts';
import { providerKinds } from '../../providers/credential-forms/index.ts';

const descriptions = {
  cloudflare:
    'Accounts that host Alchemy state or own the Workers, D1, KV, R2, Queues and DNS Console may delete.',
  aws: 'IAM keys Console uses to delete DynamoDB tables. The region is chosen per stage.',
} as const;

/** Every credential the signed-in user owns, grouped by provider. */
export function SettingsPage() {
  const query = useCredentials();
  const [dialog, setDialog] = useState<CredentialAction | null>(null);
  return (
    <main className="mx-auto w-full max-w-4xl space-y-8 px-4 py-10 sm:px-6 sm:py-14">
      <div className="max-w-2xl space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">
          Credentials
        </h1>
        <p className="text-sm leading-6 text-muted-foreground text-pretty">
          Save each account once. Stores pick a Cloudflare credential for their
          state and any others they may delete with.
        </p>
      </div>
      {query.error && (
        <QueryError
          message={query.error}
          stale={query.data !== null}
          pending={query.pending}
          onRetry={query.refresh}
        />
      )}
      {query.pending && !query.data && (
        <ListSkeleton label="Loading credentials" />
      )}
      {query.data &&
        providerKinds.map((kind) => {
          const items = query.data!.filter((item) => item.provider === kind);
          return (
            <section key={kind} className="space-y-3">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="space-y-1">
                  <h2 className="text-base font-semibold tracking-tight">
                    {providerLabel(kind)}
                  </h2>
                  <p className="text-sm text-muted-foreground text-pretty">
                    {descriptions[kind]}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant={items.length ? 'outline' : 'default'}
                  onClick={() => setDialog({ kind: 'add', provider: kind })}
                >
                  <Plus />
                  Add {providerLabel(kind)}
                </Button>
              </div>
              {items.length > 0 ? (
                <ul className="divide-y overflow-hidden rounded-lg bg-card shadow-raised">
                  {items.map((credential) => (
                    <li
                      key={credential.id}
                      className="flex min-h-14 items-center gap-3 px-3 py-2"
                    >
                      {kind === 'cloudflare' ? (
                        <Cloud className="size-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <KeyRound className="size-4 shrink-0 text-muted-foreground" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p
                          className="truncate text-sm font-medium"
                          title={credential.name}
                        >
                          {credential.name}
                        </p>
                        <p className="truncate font-mono text-xs text-muted-foreground">
                          {formatAccount(kind, credential.account)}
                        </p>
                      </div>
                      <CredentialMenu
                        credential={credential}
                        onSelect={(action) =>
                          setDialog({ kind: action, credential })
                        }
                      />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                  No {providerLabel(kind)} credentials yet.
                </p>
              )}
            </section>
          );
        })}
      {dialog && (
        <CredentialDialog
          action={dialog}
          onClose={() => setDialog(null)}
          onSaved={() => setDialog(null)}
        />
      )}
    </main>
  );
}

function CredentialMenu({
  credential,
  onSelect,
}: {
  credential: Credential;
  onSelect: (kind: 'edit' | 'delete') => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0"
            aria-label={`Actions for ${credential.name}`}
          />
        }
      >
        <EllipsisVertical />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuItem onClick={() => onSelect('edit')}>
          <Pencil />
          Edit
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onClick={() => onSelect('delete')}
        >
          <Trash2 />
          Delete credential
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
