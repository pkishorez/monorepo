import { useState } from 'react';

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '#components/ui/alert-dialog';
import { Button } from '#components/ui/button';

import { ActionButton, type Action } from '../action-button';

export function SignOutOthers({
  count,
  action,
}: {
  count: number;
  action: Action;
}) {
  const [open, setOpen] = useState(false);
  const sessions = count === 1 ? '1 other session' : `${count} other sessions`;
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={
          <Button
            variant="link"
            size="xs"
            className="relative h-auto p-0 text-xs text-muted-foreground before:absolute before:-inset-2 hover:text-foreground"
          />
        }
      >
        Sign out others
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Sign out of {sessions}?</AlertDialogTitle>
          <AlertDialogDescription>
            Every other browser and CLI signed in to your account is signed out.
            This browser stays signed in.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <ActionButton
            variant="destructive"
            action={async () => {
              await action();
              setOpen(false);
            }}
          >
            Sign out others
          </ActionButton>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
