import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@kstackz/web-toolkit/components/alert-dialog';
import { Button } from '@kstackz/web-toolkit/components/button';
import { useGate } from '../../app.ts';

/**
 * Says, once, that a User was signed out somewhere else: their money left
 * this device, and whoever else is signed in opened instead.
 */
export function AccountLost() {
  const { notice, dismissNotice: dismiss } = useGate();
  const lost = notice?.kind === 'accountLost' ? notice.user : null;
  return (
    <AlertDialog
      open={lost !== null}
      onOpenChange={(open) => !open && dismiss()}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{lost?.name} was signed out</AlertDialogTitle>
          <AlertDialogDescription>
            {lost?.name} signed out somewhere else, or their sign-in ran out, so
            their money left this device. It is still in their account; sign
            them in again to see it here.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button onClick={dismiss}>OK</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
