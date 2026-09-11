import { Effect } from 'effect';
import { useQueryClient } from '@tanstack/react-query';
import { useId, useRef, useState } from 'react';
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

type FieldName =
  | 'name'
  | 'account'
  | 'token'
  | 'accessKeyId'
  | 'secretAccessKey'
  | 'region';

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
  const savedAws = action.kind === 'credentials' ? action.store.aws : null;
  const [awsEnabled, setAwsEnabled] = useState(!!savedAws);
  const [replaceAws, setReplaceAws] = useState(!savedAws);
  const [awsFields, setAwsFields] = useState({
    accessKeyId: '',
    secretAccessKey: '',
    region: savedAws?.region ?? '',
  });
  const submitting = useRef(false);
  const aws = !awsEnabled
    ? null
    : !replaceAws
      ? undefined
      : {
          type: 'aws' as const,
          accessKeyId: awsFields.accessKeyId.trim(),
          secretAccessKey: awsFields.secretAccessKey.trim(),
          region: awsFields.region.trim(),
        };
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
            aws,
          });
          return undefined;
        }
        const store = yield* rpc['AlchemyStateStore.Create']({
          name: name.trim(),
          aws: aws ?? null,
          connection: {
            kind: 'cloudflare',
            accountId: accountId.trim(),
            apiToken: token.trim(),
          },
        });
        return store.id;
      }).pipe(
        Effect.ensuring(
          Effect.sync(() => {
            submitting.current = false;
          }),
        ),
      ),
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
          ? 'Edit connections'
          : 'Delete store?';
  const description =
    action.kind === 'delete'
      ? `Remove “${action.store.name}” and its saved credentials from this console. Its remote state stays intact.`
      : action.kind === 'add'
        ? 'We’ll find the Alchemy state store in this Cloudflare account.'
        : action.kind === 'credentials'
          ? 'Update Cloudflare access or the optional AWS connection used during stage deletion.'
          : 'Give this connection a new name.';

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !request.pending) onClose();
      }}
    >
      <DialogContent
        showCloseButton={!request.pending}
        className="max-h-[85dvh] overflow-y-auto"
        initialFocus={
          typeof window !== 'undefined' && 'ontouchstart' in window
            ? false
            : undefined
        }
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-5 [&_input]:text-base [&_button]:active:scale-[0.97]"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (request.pending || submitting.current) return;
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
              if (
                !token.trim() &&
                (action.kind === 'add' || !action.store.connection.apiToken)
              ) {
                setValidation({
                  field: 'token',
                  message: 'Paste your Cloudflare API token.',
                });
                return;
              }
              if (aws) {
                for (const field of [
                  'accessKeyId',
                  'secretAccessKey',
                  'region',
                ] as const) {
                  if (
                    !aws[field] ||
                    (field === 'region' &&
                      !/^[a-z]{2}(?:-[a-z]+)+-\d+$/.test(aws.region))
                  ) {
                    setValidation({
                      field,
                      message:
                        field === 'region'
                          ? 'Enter an AWS region, such as us-east-1.'
                          : field === 'accessKeyId'
                            ? 'Enter your AWS access key ID.'
                            : 'Enter your AWS secret access key.',
                    });
                    return;
                  }
                }
              }
            }
            submitting.current = true;
            request.run(undefined);
          }}
        >
          {(action.kind === 'add' || action.kind === 'rename') && (
            <Field id={`${id}-name`} label="Name" error={fieldError('name')}>
              <Input
                id={`${id}-name`}
                autoFocus={
                  typeof window !== 'undefined' && !('ontouchstart' in window)
                }
                autoComplete="off"
                spellCheck={false}
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  if (event.target.value.trim() && validation?.field === 'name')
                    setValidation(null);
                }}
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
                  placeholder={
                    action.kind === 'credentials' &&
                    action.store.connection.apiToken
                      ? 'Leave blank to keep the saved token'
                      : 'Paste your API token'
                  }
                  spellCheck={false}
                  data-1p-ignore
                  value={token}
                  onChange={(event) => {
                    setToken(event.target.value);
                    if (
                      validation?.field === 'token' &&
                      event.target.value.trim()
                    )
                      setValidation(null);
                  }}
                  disabled={request.pending}
                  {...fieldProps('token', `${id}-token`)}
                />
              </Field>
              <details
                open={awsEnabled || undefined}
                className="rounded-lg border p-4"
              >
                <summary className="cursor-pointer rounded-sm text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring">
                  Additional connections
                </summary>
                <div className="mt-4 space-y-4">
                  <label className="flex cursor-pointer items-center gap-3 text-sm font-medium">
                    <input
                      type="checkbox"
                      checked={awsEnabled}
                      disabled={request.pending}
                      className="size-4 accent-primary focus-visible:outline-2 focus-visible:outline-ring"
                      onChange={(event) => {
                        setAwsEnabled(event.target.checked);
                        setValidation(null);
                      }}
                    />
                    AWS connection
                  </label>
                  <p className="text-sm text-muted-foreground">
                    Optional. Allows Console to delete DynamoDB tables in one
                    AWS account and region.
                  </p>
                  {awsEnabled && !replaceAws && (
                    <div className="space-y-2">
                      <p className="text-sm">
                        AWS credentials saved · {savedAws?.region}
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={request.pending}
                        onClick={() => setReplaceAws(true)}
                      >
                        Replace AWS credentials
                      </Button>
                    </div>
                  )}
                  {awsEnabled &&
                    replaceAws &&
                    (['accessKeyId', 'secretAccessKey', 'region'] as const).map(
                      (field) => (
                        <Field
                          key={field}
                          id={`${id}-${field}`}
                          label={
                            field === 'accessKeyId'
                              ? 'Access key ID'
                              : field === 'secretAccessKey'
                                ? 'Secret access key'
                                : 'AWS region'
                          }
                          error={fieldError(field)}
                        >
                          <Input
                            id={`${id}-${field}`}
                            type={
                              field === 'secretAccessKey' ? 'password' : 'text'
                            }
                            value={awsFields[field]}
                            autoComplete="off"
                            spellCheck={false}
                            autoCapitalize="none"
                            data-1p-ignore
                            placeholder={
                              field === 'region' ? 'us-east-1' : undefined
                            }
                            disabled={request.pending}
                            onChange={(event) => {
                              const value = event.target.value;
                              setAwsFields((previous) => ({
                                ...previous,
                                [field]: value,
                              }));
                              if (
                                validation?.field === field &&
                                value.trim() &&
                                (field !== 'region' ||
                                  /^[a-z]{2}(?:-[a-z]+)+-\d+$/.test(
                                    value.trim(),
                                  ))
                              )
                                setValidation(null);
                            }}
                            {...fieldProps(field, `${id}-${field}`)}
                          />
                        </Field>
                      ),
                    )}
                </div>
              </details>
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
                    ? 'Save connections'
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
