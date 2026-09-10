import { Effect } from 'effect';
import { Button } from 'kui-toolkit/components/ui/button';
import { Badge } from 'kui-toolkit/components/ui/badge';
import { RefreshCw } from 'kui-toolkit/lucide';
import { Rpc } from '../../connections/rpc/index.ts';
import { useRpcQuery, rpcQueryKeys } from '../../session/rpc-session/index.ts';
import { QueryError, ListSkeleton } from '../query-feedback/index.ts';
import { Value } from './explorer-view.tsx';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from 'kui-toolkit/components/ui/dialog';
import { JsonTree } from 'kui-toolkit/components/blocks/json';

export function ResourceDialog({
  onClose,
  ...input
}: {
  storeId: string;
  stack: string;
  stage: string;
  resource: string;
  onClose: () => void;
}) {
  const query = useRpcQuery(
    Effect.flatMap(Rpc, (rpc) =>
      rpc['AlchemyStateStore.GetResourceState'](input),
    ),
    rpcQueryKeys.resource(
      input.storeId,
      input.stack,
      input.stage,
      input.resource,
    ),
  );
  const state = query.data?.data;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader className="pr-8">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1.5">
              <DialogTitle className="break-all">{input.resource}</DialogTitle>
              <DialogDescription>
                {input.stack} / {input.stage}
              </DialogDescription>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0"
              onClick={query.refresh}
              disabled={query.pending}
              aria-label="Refresh resource state"
              title="Refresh resource state"
            >
              <RefreshCw
                className={query.pending ? 'motion-safe:animate-spin' : ''}
              />
            </Button>
          </div>
        </DialogHeader>
        {query.error && (
          <QueryError
            message={query.error}
            stale={query.data !== null}
            pending={query.pending}
            onRetry={query.refresh}
          />
        )}
        {query.pending && !query.data && (
          <ListSkeleton label="Loading resource state" />
        )}
        {query.data && state === null && (
          <p className="py-8 text-sm text-muted-foreground">
            This resource is no longer in the store. A deployment may have
            removed it. Close this dialog and refresh the list.
          </p>
        )}
        {state && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="capitalize">
                {state.status}
              </Badge>
              <span className="break-all text-sm text-muted-foreground">
                {String(
                  state.kind === 'action'
                    ? state.actionType
                    : state.resourceType,
                )}
              </span>
            </div>
            <Value
              title={state.kind === 'action' ? 'Input' : 'Properties'}
              value={state.kind === 'action' ? state.input : state.props}
            />
            <Value
              title="Outputs"
              value={state.kind === 'action' ? state.output : state.attr}
            />
            <details className="rounded-md border p-4">
              <summary className="cursor-pointer text-sm font-medium">
                All state
              </summary>
              <div className="mt-4 overflow-auto">
                <JsonTree value={state} collapsed={2} />
              </div>
            </details>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
