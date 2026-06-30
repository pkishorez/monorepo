import { useState } from 'react';
import { Button } from '@monorepo/frontend/components/ui/button';
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
} from '@monorepo/frontend/components/ui/alert-dialog';
import { Trash2Icon } from '@monorepo/frontend/lucide';

/** Telemetry toolbar actions. The DevTools URL is owned by the route shell. */
export function Header({ onClear }: { onClear: () => void }) {
  const [clearOpen, setClearOpen] = useState(false);

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
              This deletes every trace, log, and metric from the DevTools server
              and resets the local view.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                onClear();
                setClearOpen(false);
              }}
            >
              Clear
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
