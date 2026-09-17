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

/** Flow toolbar actions. */
export function Header({ onClear }: { onClear: () => Promise<number> }) {
  const [clearOpen, setClearOpen] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  const clearFlows = async () => {
    if (isClearing) return;
    setIsClearing(true);
    try {
      const deleted = await onClear();
      setClearOpen(false);
      toast.success(
        `Cleared ${deleted} flow entr${deleted === 1 ? 'y' : 'ies'}`,
      );
    } catch (cause) {
      toast.error('Could not clear flows', {
        description: cause instanceof Error ? cause.message : String(cause),
      });
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <AlertDialog open={clearOpen} onOpenChange={setClearOpen}>
      <AlertDialogTrigger
        aria-label="Clear all flows"
        render={
          <Button variant="ghost" size="icon-sm">
            <Trash2Icon className="size-4" />
          </Button>
        }
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Clear all flows?</AlertDialogTitle>
          <AlertDialogDescription>
            This deletes every Flow Entry from the DevTools server and resets
            the local view. Traces and logs are not affected.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isClearing}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={isClearing}
            onClick={() => void clearFlows()}
          >
            {isClearing ? 'Clearing…' : 'Clear'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
