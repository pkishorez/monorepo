import type { Account } from '@kstackz/auth-toolkit/gate';
import { Button } from '@kstackz/expo-toolkit/components/button';
import { Dialog } from '@kstackz/expo-toolkit/components/dialog';
import { useGate } from '../../ledger';

/**
 * Says a User was signed out somewhere else, and stays until they sign in
 * again, keeping their money on this phone, or another User opens,
 * deleting it.
 */
export function AccountLost(props: {
  readonly account: Account;
  readonly accounts: ReadonlyArray<Account>;
}) {
  const { signIn, switchTo, signOut } = useGate();
  const { name } = props.account.user;
  return (
    <Dialog open>
      <Dialog.Content>
        <Dialog.Title>{`${name} was signed out`}</Dialog.Title>
        <Dialog.Description>
          {`${name} signed out somewhere else, or their sign-in ran out. Sign them in again to keep their money on this phone, or switch to someone else and it leaves this phone.`}
        </Dialog.Description>
        <Dialog.Footer>
          {props.accounts.map(({ user }) => (
            <Button
              key={user.id}
              variant="outline"
              onPress={() => switchTo(user.id)}
            >
              {`Switch to ${user.name}`}
            </Button>
          ))}
          {props.accounts.length === 0 && (
            <Button variant="outline" onPress={() => void signOut()}>
              Sign out
            </Button>
          )}
          <Button onPress={() => void signIn()}>Sign in again</Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog>
  );
}
