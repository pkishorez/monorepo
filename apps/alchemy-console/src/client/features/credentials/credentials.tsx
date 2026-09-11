import { Effect } from 'effect';
import { useQueryClient } from '@tanstack/react-query';
import { useId, useRef, useState } from 'react';
import { Button } from 'kui-toolkit/components/ui/button';
import { Input } from 'kui-toolkit/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from 'kui-toolkit/components/ui/dialog';
import { CircleAlert } from 'kui-toolkit/lucide';
import { Rpc } from '../../connections/rpc/index.ts';
import { useRpcQuery, useRpcAction } from '../../session/rpc-session/index.ts';
import type { credentialView } from '../../../shared/contracts/credentials/index.ts';
import {
  Field,
  SecretFields,
  formatAccount,
  providerForm,
  providerLabel,
  toSecret,
  validateSecret,
  type ProviderKind,
} from '../../providers/credential-forms/index.ts';

export type Credential = typeof credentialView.Type;
export const credentialKeys = { all: ['credentials'] as const };

export const useCredentials = () =>
  useRpcQuery(
    Effect.flatMap(Rpc, (rpc) => rpc['Credentials.List']({})),
    credentialKeys.all,
  );

/** "Name · account" for menus and lists. */
export const describeCredential = (credential: Credential) =>
  `${credential.name} · ${formatAccount(credential.provider, credential.account)}`;

export type CredentialAction =
  | { kind: 'add'; provider: ProviderKind }
  | { kind: 'edit'; credential: Credential }
  | { kind: 'delete'; credential: Credential };

export function CredentialDialog({
  action,
  onClose,
  onSaved,
}: {
  action: CredentialAction;
  onClose: () => void;
  onSaved: (credential: Credential | null) => void;
}) {
  const id = useId();
  const queryClient = useQueryClient();
  const provider =
    action.kind === 'add' ? action.provider : action.credential.provider;
  const form = providerForm(provider);
  const [name, setName] = useState(
    action.kind === 'add' ? '' : action.credential.name,
  );
  // Editing keeps the saved secret unless the user chooses to replace it.
  const [replacing, setReplacing] = useState(action.kind === 'add');
  const [values, setValues] = useState<Record<string, string>>({});
  const [validation, setValidation] = useState<{
    field: string;
    message: string;
  } | null>(null);
  const submitting = useRef(false);
  const request = useRpcAction(
    () =>
      Effect.gen(function* () {
        const rpc = yield* Rpc;
        if (action.kind === 'delete') {
          yield* rpc['Credentials.Delete']({ id: action.credential.id });
          return null;
        }
        const secret = replacing ? toSecret(provider, values) : undefined;
        if (action.kind === 'edit')
          return yield* rpc['Credentials.Update']({
            id: action.credential.id,
            name: name.trim(),
            ...(secret ? { secret } : {}),
          });
        return yield* rpc['Credentials.Create']({
          name: name.trim(),
          secret: secret!,
        });
      }).pipe(
        Effect.ensuring(
          Effect.sync(() => {
            submitting.current = false;
          }),
        ),
      ),
    (credential) => {
      void queryClient.invalidateQueries({ queryKey: credentialKeys.all });
      onSaved(credential);
    },
  );
  const title =
    action.kind === 'add'
      ? `Add ${form.label} credential`
      : action.kind === 'edit'
        ? `Edit ${form.label} credential`
        : 'Delete credential?';
  const description =
    action.kind === 'delete'
      ? `Remove “${action.credential.name}” from this console. Stores that use it must be changed first.`
      : action.kind === 'add'
        ? form.description
        : `Account ${formatAccount(provider, action.credential.account)}. The secret stays saved unless you replace it.`;
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
            if (action.kind !== 'delete') {
              if (!name.trim()) {
                setValidation({
                  field: 'name',
                  message: 'Give this credential a name.',
                });
                return;
              }
              if (replacing) {
                const invalid = validateSecret(provider, values);
                if (invalid) {
                  setValidation(invalid);
                  return;
                }
              }
            }
            submitting.current = true;
            request.run(undefined);
          }}
        >
          {action.kind !== 'delete' && (
            <Field
              id={`${id}-name`}
              label="Name"
              error={
                validation?.field === 'name' ? validation.message : undefined
              }
            >
              <Input
                id={`${id}-name`}
                autoFocus={
                  typeof window !== 'undefined' && !('ontouchstart' in window)
                }
                autoComplete="off"
                spellCheck={false}
                value={name}
                placeholder={form.namePlaceholder}
                disabled={request.pending}
                onChange={(event) => {
                  setName(event.target.value);
                  if (validation?.field === 'name') setValidation(null);
                }}
                aria-invalid={validation?.field === 'name' || undefined}
              />
            </Field>
          )}
          {action.kind === 'edit' && !replacing && (
            <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <p className="text-sm">Secret saved</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={request.pending}
                onClick={() => setReplacing(true)}
              >
                Replace secret
              </Button>
            </div>
          )}
          {action.kind !== 'delete' && replacing && (
            <SecretFields
              kind={provider}
              idPrefix={id}
              values={values}
              disabled={request.pending}
              error={validation?.field === 'name' ? null : validation}
              onChange={(key, value) => {
                setValues((current) => ({ ...current, [key]: value }));
                if (validation?.field === key) setValidation(null);
              }}
            />
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
                ? action.kind === 'delete'
                  ? 'Deleting…'
                  : 'Verifying…'
                : action.kind === 'add'
                  ? 'Add credential'
                  : action.kind === 'edit'
                    ? 'Save credential'
                    : 'Delete credential'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export { providerLabel, formatAccount };
