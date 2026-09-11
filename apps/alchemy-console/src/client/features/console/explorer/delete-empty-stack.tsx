import { Effect } from 'effect';
import { useState } from 'react';
import { Button } from 'kui-toolkit/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from 'kui-toolkit/components/ui/dialog';
import { Trash2 } from 'kui-toolkit/lucide';
import { isAlchemyManagedStack } from '../../../../shared/contracts/targets/index.ts';
import { Rpc } from '../../../connections/rpc/index.ts';
import { useRpcAction } from '../queries/index.ts';

export function DeleteEmptyStackAction({
  storeId,
  stack,
  className,
  onDeleted,
}: {
  storeId: string;
  stack: string;
  className?: string;
  onDeleted: (stack: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const deletion = useRpcAction(
    () =>
      Effect.flatMap(Rpc, (rpc) =>
        rpc['Stores.DeleteStack']({ storeId, stack }),
      ),
    () => {
      setOpen(false);
      onDeleted(stack);
    },
  );
  if (isAlchemyManagedStack(stack)) return null;
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className={`size-11 text-muted-foreground hover:text-destructive ${className ?? ''}`}
        aria-label={`Delete empty stack ${stack}`}
        title={`Delete empty stack ${stack}`}
        onClick={() => setOpen(true)}
      >
        <Trash2 />
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!deletion.pending) setOpen(next);
        }}
      >
        <DialogContent showCloseButton={!deletion.pending}>
          <DialogHeader>
            <DialogTitle>Delete empty stack?</DialogTitle>
            <DialogDescription>
              Remove “{stack}” from this state store. This removes its empty
              state entry and does not delete deployed infrastructure.
            </DialogDescription>
          </DialogHeader>
          {deletion.error && (
            <p role="alert" className="text-sm text-destructive">
              {deletion.error}
            </p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={deletion.pending}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deletion.pending}
              onClick={() => deletion.run(undefined)}
            >
              {deletion.pending ? 'Deleting…' : 'Delete stack'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
