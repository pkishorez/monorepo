import type { Account } from '@kstackz/auth-toolkit/client';
import { AccountLost as Dialog } from '@kstackz/expo-platform/recipes/account-lost';
import { useGate } from '../../ledger';

/** The Account Lost recipe, answered by the Gate. */
export function AccountLost(props: {
  readonly account: Account;
  readonly accounts: ReadonlyArray<Account>;
}) {
  const { signIn, switchTo, signOut } = useGate();
  return (
    <Dialog
      lost={props.account.user}
      others={props.accounts.map(({ user }) => user)}
      onSignInAgain={() => void signIn()}
      onSwitch={switchTo}
      onSignOut={() => void signOut()}
    />
  );
}
