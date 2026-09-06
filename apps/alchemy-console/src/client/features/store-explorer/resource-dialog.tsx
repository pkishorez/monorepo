import { Effect } from 'effect';
import { Button } from 'kui-toolkit/components/ui/button';
import { RefreshCw } from 'kui-toolkit/lucide';
import { Rpc } from '../../connections/rpc/index.ts';
import { useRpcQuery, rpcQueryKeys } from '../../session/rpc-session/index.ts';
import { QueryFeedback, Value } from './explorer-view.tsx';
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
        <DialogHeader>
          <DialogTitle className="break-all pr-6">{input.resource}</DialogTitle>
          <DialogDescription>
            {input.stack} / {input.stage}
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end">
          <Button
            variant="outline"
            onClick={query.refresh}
            disabled={query.pending}
          >
            <RefreshCw className={query.pending ? 'animate-spin' : ''} />
            Refresh state
          </Button>
        </div>
        <QueryFeedback query={query} />
        {query.data && state === null && (
          <p className="py-8 text-sm text-muted-foreground">
            This resource is no longer available. It may have been removed by a
            deployment.
          </p>
        )}
        {state && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium">
                {state.status}
              </span>
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
            <details className="rounded-lg border p-4">
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
