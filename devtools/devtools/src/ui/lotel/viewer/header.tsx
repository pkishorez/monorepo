import { useState } from 'react';
import { Button } from 'kui-toolkit/components/ui/button';
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
} from 'kui-toolkit/components/ui/alert-dialog';
import { Trash2Icon } from 'kui-toolkit/lucide';
import { toast } from 'kui-toolkit/components/ui/sonner';

/** Telemetry toolbar actions. The DevTools URL is owned by the route shell. */
export function Header({ onClear }: { onClear: () => Promise<number> }) {
  const [clearOpen, setClearOpen] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  const clearTelemetry = async () => {
    if (isClearing) return;
    setIsClearing(true);
    try {
      const deleted = await onClear();
      setClearOpen(false);
      toast.success(
        `Cleared ${deleted} telemetry record${deleted === 1 ? '' : 's'}`,
      );
    } catch (cause) {
      toast.error('Could not clear telemetry', {
        description: cause instanceof Error ? cause.message : String(cause),
      });
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <div className="flex items-center justify-end gap-1">
      <AlertDialog open={clearOpen} onOpenChange={setClearOpen}>
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
              This deletes every trace, log, and flow from the DevTools server
              and resets the local view.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isClearing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isClearing}
              onClick={() => void clearTelemetry()}
            >
              {isClearing ? 'Clearing…' : 'Clear'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
