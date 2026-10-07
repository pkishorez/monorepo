import type { Account } from '@kstackz/auth-toolkit/gate';
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
 * Says a User was signed out somewhere else, and stays until they sign in
 * again, keeping their money on this device, or another User opens,
 * deleting it.
 */
export function AccountLost(props: {
  readonly account: Account;
  readonly accounts: ReadonlyArray<Account>;
}) {
  const { signIn, switchTo, signOut } = useGate();
  const { name } = props.account.user;
  return (
    <AlertDialog open>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{name} was signed out</AlertDialogTitle>
          <AlertDialogDescription>
            {name} signed out somewhere else, or their sign-in ran out. Sign
            them in again to keep their money on this device, or switch to
            someone else and it leaves this device.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          {props.accounts.map(({ user }) => (
            <Button
              key={user.id}
              variant="outline"
              onClick={() => switchTo(user.id)}
            >
              Switch to {user.name}
            </Button>
          ))}
          {props.accounts.length === 0 && (
            <Button variant="outline" onClick={() => void signOut()}>
              Sign out
            </Button>
          )}
          <Button onClick={() => void signIn()}>Sign in again</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
