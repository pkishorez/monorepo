import { Effect } from 'effect';
import { useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import type { ReactNode } from 'react';
import { Button } from 'kui-toolkit/components/ui/button';
import { Input } from 'kui-toolkit/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from 'kui-toolkit/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from 'kui-toolkit/components/ui/dialog';
import { ChevronDown, CircleAlert, ExternalLink } from 'kui-toolkit/lucide';
import { Rpc } from '../../../connections/rpc/index.ts';
import type { stateStoreView } from '../../../../shared/contracts/state-stores/index.ts';
import { useRpcAction, rpcQueryKeys } from '../store-query/index.ts';
import {
  cloudflareAccountUrl,
  cloudflareTokenUrl,
} from './cloudflare-token-url.ts';

type FieldName = 'name' | 'account' | 'token';

function Field({
  id,
  label,
  error,
  aside,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={id} className="block text-sm font-medium">
          {label}
        </label>
        {aside}
      </div>
      {children}
      {error && (
        <p
          id={`${id}-error`}
          role="alert"
          className="flex items-start gap-1.5 text-sm text-destructive"
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  );
}

export function StoreDialog({
  action,
  onClose,
  onSaved,
}: {
  action:
    | { kind: 'add' }
    | {
        kind: 'rename' | 'delete' | 'credentials';
        store: typeof stateStoreView.Type;
      };
  onClose: () => void;
  onSaved: (storeId?: string) => void;
}) {
  const id = useId();
  const queryClient = useQueryClient();
  const [name, setName] = useState(
    action.kind === 'add' ? '' : action.store.name,
  );
  const connects = action.kind === 'add' || action.kind === 'credentials';
  const [accountId, setAccountId] = useState(
    action.kind === 'credentials'
      ? (action.store.connection.accountId ?? '')
      : '',
  );
  const [token, setToken] = useState('');
  const validAccount = cloudflareTokenUrl(accountId) !== null;
  const [validation, setValidation] = useState<{
    field: FieldName;
    message: string;
  } | null>(null);
  const fieldError = (field: FieldName) =>
    validation?.field === field ? validation.message : undefined;
  const fieldProps = (field: FieldName, fieldId: string) => ({
    'aria-invalid': validation?.field === field || undefined,
    'aria-describedby':
      validation?.field === field ? `${fieldId}-error` : undefined,
  });
  const request = useRpcAction(
    () =>
      Effect.gen(function* () {
        const rpc = yield* Rpc;
        if (action.kind === 'delete') {
          yield* rpc['AlchemyStateStore.Delete']({ id: action.store.id });
          return undefined;
        }
        if (action.kind === 'rename') {
          yield* rpc['AlchemyStateStore.Rename']({
            id: action.store.id,
            name: name.trim(),
          });
          return undefined;
        }
        if (action.kind === 'credentials') {
          yield* rpc['AlchemyStateStore.UpdateCredentials']({
            id: action.store.id,
            accountId: accountId.trim(),
            apiToken: token.trim(),
          });
          return undefined;
        }
        const store = yield* rpc['AlchemyStateStore.Create']({
          name: name.trim(),
          connection: {
            kind: 'cloudflare',
            accountId: accountId.trim(),
            apiToken: token.trim(),
          },
        });
        return store.id;
      }),
    (storeId) => {
      void queryClient.invalidateQueries({ queryKey: rpcQueryKeys.stores });
      if (action.kind === 'delete') {
        queryClient.removeQueries({
          queryKey: rpcQueryKeys.stacks(action.store.id),
        });
      }
      onSaved(storeId);
    },
  );
  const title =
    action.kind === 'add'
      ? 'Add store'
      : action.kind === 'rename'
        ? 'Rename store'
        : action.kind === 'credentials'
          ? 'Update token'
          : 'Delete store?';
  const description =
    action.kind === 'delete'
      ? `Remove “${action.store.name}” and its saved token from this console. Its remote state stays intact.`
      : action.kind === 'add'
        ? 'We’ll find the Alchemy state store in this Cloudflare account.'
        : action.kind === 'credentials'
          ? 'Paste a new token. Stage deletion uses it for every resource.'
          : 'Give this connection a new name.';

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !request.pending) onClose();
      }}
    >
      <DialogContent showCloseButton={!request.pending}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-5"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            setValidation(null);
            if (action.kind !== 'delete' && !name.trim()) {
              setValidation({ field: 'name', message: 'Enter a store name.' });
              return;
            }
            if (connects) {
              if (!validAccount) {
                setValidation({
                  field: 'account',
                  message: 'Enter the 32-character account ID from Cloudflare.',
                });
                return;
              }
              if (!token.trim()) {
                setValidation({
                  field: 'token',
                  message: 'Paste your Cloudflare API token.',
                });
                return;
              }
            }
            request.run(undefined);
          }}
        >
          {(action.kind === 'add' || action.kind === 'rename') && (
            <Field id={`${id}-name`} label="Name" error={fieldError('name')}>
              <Input
                id={`${id}-name`}
                autoFocus
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Personal Cloudflare"
                disabled={request.pending}
                {...fieldProps('name', `${id}-name`)}
              />
            </Field>
          )}
          {connects && (
            <>
              <Field
                id={`${id}-account`}
                label="Cloudflare account ID"
                error={fieldError('account')}
                aside={
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    render={
                      <a
                        href={cloudflareAccountUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      />
                    }
                  >
                    Open Cloudflare
                    <ExternalLink />
                  </Button>
                }
              >
                <Input
                  id={`${id}-account`}
                  autoComplete="off"
                  spellCheck={false}
                  type="text"
                  value={accountId}
                  onChange={(event) => {
                    setAccountId(event.target.value);
                    setToken('');
                    setValidation(null);
                  }}
                  placeholder="32-character account ID"
                  aria-description="Pick an account in Cloudflare; the ID is in the page URL and under Account details."
                  readOnly={
                    action.kind === 'credentials' &&
                    action.store.connection.accountId !== null
                  }
                  disabled={request.pending}
                  {...fieldProps('account', `${id}-account`)}
                />
              </Field>
              <Field
                id={`${id}-token`}
                label="Cloudflare API token"
                error={fieldError('token')}
                aside={
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      disabled={!validAccount || request.pending}
                      render={
                        <Button type="button" variant="outline" size="xs" />
                      }
                    >
                      Create token
                      <ChevronDown />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-64">
                      {(['read', 'write'] as const).map((access) => (
                        <DropdownMenuItem
                          key={access}
                          render={
                            <a
                              href={cloudflareTokenUrl(accountId, access) ?? ''}
                              target="_blank"
                              rel="noopener noreferrer"
                            />
                          }
                        >
                          <span className="flex flex-col gap-0.5">
                            <span>{access === 'read' ? 'Read' : 'Write'}</span>
                            <span className="text-xs text-muted-foreground">
                              {access === 'read'
                                ? 'Browse stacks, stages, and resources'
                                : 'Browse and delete stages. Add Hyperdrive by hand if you use it.'}
                            </span>
                          </span>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                }
              >
                <Input
                  id={`${id}-token`}
                  type="password"
                  autoComplete="off"
                  placeholder="Paste your API token"
                  value={token}
                  onChange={(event) => setToken(event.target.value)}
                  disabled={request.pending}
                  {...fieldProps('token', `${id}-token`)}
                />
              </Field>
            </>
          )}
          {request.error && (
            <p
              role="alert"
              className="flex items-start gap-1.5 text-sm text-destructive"
            >
              <CircleAlert
                className="mt-0.5 size-4 shrink-0"
                aria-hidden="true"
              />
              {request.error}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={request.pending}
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant={action.kind === 'delete' ? 'destructive' : 'default'}
              disabled={request.pending}
            >
              {request.pending
                ? action.kind === 'add'
                  ? 'Finding store…'
                  : action.kind === 'delete'
                    ? 'Deleting…'
                    : 'Saving…'
                : action.kind === 'add'
                  ? 'Add store'
                  : action.kind === 'credentials'
                    ? 'Save token'
                    : action.kind === 'delete'
                      ? 'Delete store'
                      : 'Save name'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
