import { Button } from '../../components/button';
import { Dialog } from '../../components/dialog';

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
 * Says a User was signed out on another device or app, as web-toolkit's
 * AccountLost recipe does on the web, and stays until they are signed in
 * again, keeping what this phone holds for them, or someone else opens,
 * deleting it. It cannot be dismissed.
 */
export function AccountLost(props: AccountLostProps) {
  const { name } = props.lost;
  return (
    <Dialog open>
      <Dialog.Content>
        <Dialog.Title>{`${name} was signed out`}</Dialog.Title>
        <Dialog.Description>
          {`${name} signed out somewhere else, or their sign-in ran out. Sign them in again to keep their data on this phone, or switch to someone else and it leaves this phone.`}
        </Dialog.Description>
        <Dialog.Footer>
          {props.others.map((user) => (
            <Button
              key={user.id}
              variant="outline"
              onPress={() => props.onSwitch(user.id)}
            >
              {`Switch to ${user.name}`}
            </Button>
          ))}
          {props.others.length === 0 && (
            <Button variant="outline" onPress={props.onSignOut}>
              Sign out
            </Button>
          )}
          <Button onPress={props.onSignInAgain}>Sign in again</Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog>
  );
}
