import { Effect } from 'effect';
import { useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
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
import { Rpc } from '../../connections/rpc/index.ts';
import type { stateStoreView } from '../../../shared/contracts/state-stores/index.ts';
import { useRpcAction, rpcQueryKeys } from '../../session/rpc-session/index.ts';
import { cloudflareTokenUrl } from './cloudflare-token-url.ts';

export function StoreDialog({
  action,
  onClose,
  onSaved,
}: {
  action:
    | { kind: 'add' }
    | { kind: 'rename' | 'delete'; store: typeof stateStoreView.Type };
  onClose: () => void;
  onSaved: (storeId?: string) => void;
}) {
  const id = useId();
  const queryClient = useQueryClient();
  const [name, setName] = useState(
    action.kind === 'add' ? '' : action.store.name,
  );
  const [accountId, setAccountId] = useState('');
  const [token, setToken] = useState('');
  const tokenUrl = cloudflareTokenUrl(accountId);
  const [validation, setValidation] = useState<string | null>(null);
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
        : 'Delete store?';

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !request.pending) onClose();
      }}
    >
      <DialogContent
        showCloseButton={!request.pending}
        className={action.kind === 'add' ? 'gap-8 p-6 sm:p-8' : undefined}
      >
        <DialogHeader>
          <DialogTitle
            className={action.kind === 'add' ? 'text-lg' : undefined}
          >
            {title}
          </DialogTitle>
          <DialogDescription
            className={action.kind === 'add' ? 'sr-only' : undefined}
          >
            {action.kind === 'delete'
              ? `Remove “${action.store.name}” and its saved token. Its remote state stays intact.`
              : action.kind === 'add'
                ? 'We’ll find your existing Alchemy state store in this account.'
                : 'Give this connection a new name.'}
          </DialogDescription>
        </DialogHeader>
        <form
          className={action.kind === 'add' ? 'space-y-6' : 'space-y-5'}
          onSubmit={(event) => {
            event.preventDefault();
            setValidation(null);
            if (action.kind !== 'delete' && !name.trim()) {
              setValidation('Enter a store name.');
              return;
            }
            if (action.kind === 'add') {
              if (!tokenUrl) {
                setValidation(
                  'Enter a valid 32-character Cloudflare account ID.',
                );
                return;
              }
              if (!token.trim()) {
                setValidation('Enter your Cloudflare API token.');
                return;
              }
            }
            request.run(undefined);
          }}
        >
          {action.kind !== 'delete' && (
            <div className="space-y-2">
              <label
                htmlFor={`${id}-name`}
                className="block text-sm font-medium"
              >
                Name
              </label>
              <Input
                id={`${id}-name`}
                className={
                  action.kind === 'add' ? 'h-11 px-3 shadow-none' : undefined
                }
                autoFocus
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Personal Cloudflare"
                required
                disabled={request.pending}
              />
            </div>
          )}
          {action.kind === 'add' && (
            <>
              <div className="space-y-2">
                <label
                  htmlFor={`${id}-account`}
                  className="block text-sm font-medium"
                >
                  Cloudflare account ID
                </label>
                <Input
                  id={`${id}-account`}
                  className="h-11 px-3 shadow-none"
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
                  required
                  disabled={request.pending}
                />
              </div>
              {tokenUrl && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <label
                      htmlFor={`${id}-token`}
                      className="block text-sm font-medium"
                    >
                      Cloudflare API token
                    </label>
                    <a
                      href={tokenUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
                    >
                      Create token ↗
                    </a>
                  </div>
                  <Input
                    id={`${id}-token`}
                    className="h-11 px-3 shadow-none"
                    type="password"
                    autoComplete="off"
                    placeholder="Paste your API token"
                    value={token}
                    onChange={(event) => setToken(event.target.value)}
                    required
                    disabled={request.pending}
                  />
                </div>
              )}
            </>
          )}
          {(validation || request.error) && (
            <p role="alert" className="text-sm text-destructive">
              {validation ?? request.error}
            </p>
          )}
          <DialogFooter className={action.kind === 'add' ? 'pt-2' : undefined}>
            <Button
              type="button"
              variant={action.kind === 'add' ? 'ghost' : 'outline'}
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
                  ? 'Discovering store…'
                  : 'Saving…'
                : action.kind === 'add'
                  ? 'Add store'
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
