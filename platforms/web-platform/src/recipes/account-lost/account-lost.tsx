import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '#components/ui/alert-dialog';
import { Button } from '#components/ui/button';

/** A User the dialog names. */
export interface AccountLostUser {
  id: string;
  name: string;
}

export interface AccountLostProps {
  /** The User signed out somewhere else. */
  lost: AccountLostUser;
  /** The Users still signed in, each one to switch to. */
  others: ReadonlyArray<AccountLostUser>;
  onSignInAgain: () => void;
  onSwitch: (userId: string) => void;
  /** Offered only when nobody else is signed in. */
  onSignOut: () => void;
}

/**
 * Says a User was signed out on another device or app, and stays until
 * they are signed in again, keeping what this device holds for them, or
 * someone else opens, deleting it. It cannot be dismissed.
 */
export function AccountLost(props: AccountLostProps) {
  const { name } = props.lost;
  return (
    <AlertDialog open>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{name} was signed out</AlertDialogTitle>
          <AlertDialogDescription>
            {name} signed out somewhere else, or their sign-in ran out. Sign
            them in again to keep their data on this device, or switch to
            someone else and it leaves this device.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          {props.others.map((user) => (
            <Button
              key={user.id}
              variant="outline"
              onClick={() => props.onSwitch(user.id)}
            >
              Switch to {user.name}
            </Button>
          ))}
          {props.others.length === 0 && (
            <Button variant="outline" onClick={props.onSignOut}>
              Sign out
            </Button>
          )}
          <Button onClick={props.onSignInAgain}>Sign in again</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
