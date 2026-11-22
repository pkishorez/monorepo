import { Button } from '@kestack/web-platform/ui/components/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@kestack/web-platform/ui/components/alert-dialog';
import { Trash2Icon } from 'lucide-react';

/**
 * Clearing all telemetry, behind a confirmation: `clearing` says whether
 * it is being asked, `confirming`, or under way, `clearing`.
 */
export function ClearTelemetry({
  clearing,
  onAsk,
  onDismiss,
  onConfirm,
}: {
  clearing: 'idle' | 'confirming' | 'clearing';
  onAsk: () => void;
  onDismiss: () => void;
  onConfirm: () => void;
}) {
  const isClearing = clearing === 'clearing';
  return (
    <div className="flex items-center justify-end gap-1">
      <AlertDialog
        open={clearing !== 'idle'}
        onOpenChange={(open) => (open ? onAsk() : onDismiss())}
      >
        <AlertDialogTrigger
          aria-label="Clear all records"
          render={
            <Button variant="ghost" size="icon-sm">
              <Trash2Icon className="size-4" />
            </Button>
          }
        />
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear all telemetry?</AlertDialogTitle>
            <AlertDialogDescription>
              This deletes every trace and log from the DevTools server and
              resets the local view.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isClearing}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={isClearing} onClick={onConfirm}>
              {isClearing ? 'Clearing…' : 'Clear'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
