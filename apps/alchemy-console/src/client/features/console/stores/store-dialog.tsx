import { Effect } from 'effect';
import { useQueryClient } from '@tanstack/react-query';
import { useId, useRef, useState } from 'react';
import { Button } from 'kui-toolkit/components/ui/button';
import { Input } from 'kui-toolkit/components/ui/input';
import { Checkbox } from 'kui-toolkit/components/ui/checkbox';
import {
  NativeSelect,
  NativeSelectOption,
} from 'kui-toolkit/components/ui/native-select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from 'kui-toolkit/components/ui/dialog';
import { CircleAlert, Plus } from 'kui-toolkit/lucide';
import { Rpc } from '../../../connections/rpc/index.ts';
import type { storeView } from '../../../../shared/contracts/stores/index.ts';
import { useRpcAction, rpcQueryKeys } from '../queries/index.ts';
import {
  CredentialDialog,
  describeCredential,
  providerLabel,
  useCredentials,
  type Credential,
  type CredentialAction,
} from '../../credentials/index.ts';
import {
  Field,
  providerKinds,
} from '../../../providers/credential-forms/index.ts';

type Store = typeof storeView.Type;

export function StoreDialog({
  action,
  onClose,
  onSaved,
}: {
  action: { kind: 'add' } | { kind: 'edit' | 'delete'; store: Store };
  onClose: () => void;
  onSaved: (storeId?: string) => void;
}) {
  const id = useId();
  const queryClient = useQueryClient();
  const credentials = useCredentials();
  const [name, setName] = useState(
    action.kind === 'add' ? '' : action.store.name,
  );
  const [stateCredentialId, setStateCredentialId] = useState(
    action.kind === 'add' ? '' : action.store.state.credentialId,
  );
  const [grants, setGrants] = useState<readonly string[]>(
    action.kind === 'add' ? [] : action.store.grants,
  );
  const [credentialDialog, setCredentialDialog] =
    useState<CredentialAction | null>(null);
  const [validation, setValidation] = useState<{
    field: 'name' | 'state';
    message: string;
  } | null>(null);
  const submitting = useRef(false);
  const all = credentials.data ?? [];
  const cloudflare = all.filter((item) => item.provider === 'cloudflare');
  const state = cloudflare.find((item) => item.id === stateCredentialId);
  // The state credential already covers Cloudflare resources, so grants only
  // add other providers.
  const grantable = all.filter((item) => item.provider !== 'cloudflare');
  const grantKinds = providerKinds.filter((kind) => kind !== 'cloudflare');
  const request = useRpcAction(
    () =>
      Effect.gen(function* () {
        const rpc = yield* Rpc;
        if (action.kind === 'delete') {
          yield* rpc['Stores.Delete']({ id: action.store.id });
          return undefined;
        }
        const granted = grants.filter((grant) =>
          grantable.some((item) => item.id === grant),
        );
        if (action.kind === 'edit') {
          yield* rpc['Stores.Update']({
            id: action.store.id,
            name: name.trim(),
            grants: granted,
          });
          return undefined;
        }
        const store = yield* rpc['Stores.Create']({
          name: name.trim(),
          stateCredentialId,
          grants: granted,
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
      if (action.kind === 'delete')
        queryClient.removeQueries({
          queryKey: rpcQueryKeys.stacks(action.store.id),
        });
      onSaved(storeId);
    },
  );
  const title =
    action.kind === 'add'
      ? 'Add store'
      : action.kind === 'edit'
        ? 'Edit store'
        : 'Delete store?';
  const description =
    action.kind === 'delete'
      ? `Remove “${action.store.name}” from this console. Its remote state and your credentials stay intact.`
      : action.kind === 'add'
        ? 'We’ll find the Alchemy state store in the Cloudflare account you pick.'
        : 'Change the name, or which credentials this store may delete with.';
  const addCredential = (provider: Credential['provider']) =>
    setCredentialDialog({ kind: 'add', provider });
  return (
    <>
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open && !request.pending && !credentialDialog) onClose();
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
                setValidation({
                  field: 'name',
                  message: 'Enter a store name.',
                });
                return;
              }
              if (action.kind === 'add' && !state) {
                setValidation({
                  field: 'state',
                  message:
                    'Choose the Cloudflare credential that hosts this state.',
                });
                return;
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
                  onChange={(event) => {
                    setName(event.target.value);
                    if (validation?.field === 'name') setValidation(null);
                  }}
                  placeholder="Personal Cloudflare"
                  disabled={request.pending}
                  aria-invalid={validation?.field === 'name' || undefined}
                />
              </Field>
            )}
            {action.kind === 'add' && (
              <Field
                id={`${id}-state`}
                label="State lives in"
                error={
                  validation?.field === 'state' ? validation.message : undefined
                }
                description="The Cloudflare account whose alchemy-state-store Worker holds this state."
                aside={
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    disabled={request.pending}
                    onClick={() => addCredential('cloudflare')}
                  >
                    <Plus />
                    Add Cloudflare
                  </Button>
                }
              >
                <NativeSelect
                  className="w-full"
                  id={`${id}-state`}
                  value={stateCredentialId}
                  disabled={
                    request.pending ||
                    (credentials.pending && !credentials.data)
                  }
                  onChange={(event) => {
                    setStateCredentialId(event.target.value);
                    if (validation?.field === 'state') setValidation(null);
                  }}
                  aria-invalid={validation?.field === 'state' || undefined}
                >
                  <NativeSelectOption value="">
                    {cloudflare.length
                      ? 'Choose a Cloudflare credential'
                      : 'No Cloudflare credentials yet'}
                  </NativeSelectOption>
                  {cloudflare.map((item) => (
                    <NativeSelectOption key={item.id} value={item.id}>
                      {describeCredential(item)}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
            )}
            {action.kind === 'edit' && state && (
              <div className="space-y-1">
                <p className="text-sm font-medium">State lives in</p>
                <p className="text-sm text-muted-foreground">
                  {describeCredential(state)}
                </p>
              </div>
            )}
            {action.kind !== 'delete' && (
              <fieldset className="space-y-3">
                <legend className="text-sm font-medium">
                  May also delete with
                </legend>
                <p className="text-xs text-muted-foreground">
                  The Cloudflare credential above already covers Cloudflare
                  resources. Add other providers here; you confirm which one
                  applies during each deletion.
                </p>
                {grantKinds.map((kind) => {
                  const items = grantable.filter(
                    (item) => item.provider === kind,
                  );
                  return (
                    <div key={kind} className="space-y-2 rounded-lg border p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium">
                          {providerLabel(kind)}
                        </p>
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          disabled={request.pending}
                          onClick={() => addCredential(kind)}
                        >
                          <Plus />
                          Add
                        </Button>
                      </div>
                      {items.length === 0 && (
                        <p className="text-xs text-muted-foreground">
                          No {providerLabel(kind)} credentials yet.
                        </p>
                      )}
                      {items.map((item) => {
                        const checked = grants.includes(item.id);
                        return (
                          <label
                            key={item.id}
                            className="flex cursor-pointer items-center gap-2 text-sm"
                          >
                            <Checkbox
                              checked={checked}
                              disabled={request.pending}
                              onCheckedChange={(next) =>
                                setGrants((current) =>
                                  next === true
                                    ? [...current, item.id]
                                    : current.filter(
                                        (grant) => grant !== item.id,
                                      ),
                                )
                              }
                            />
                            <span className="truncate">
                              {describeCredential(item)}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  );
                })}
              </fieldset>
            )}
            {(request.error || credentials.error) && (
              <p
                role="alert"
                className="flex items-start gap-1.5 text-sm text-destructive"
              >
                <CircleAlert
                  className="mt-0.5 size-4 shrink-0"
                  aria-hidden="true"
                />
                {request.error ?? credentials.error}
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
                    : action.kind === 'edit'
                      ? 'Save store'
                      : 'Delete store'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {credentialDialog && (
        <CredentialDialog
          action={credentialDialog}
          onClose={() => setCredentialDialog(null)}
          onSaved={(created) => {
            setCredentialDialog(null);
            if (!created) return;
            if (created.provider === 'cloudflare')
              setStateCredentialId(created.id);
            else setGrants((current) => [...current, created.id]);
          }}
        />
      )}
    </>
  );
}
