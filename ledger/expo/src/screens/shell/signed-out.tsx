import { Button } from '@kstackz/expo-toolkit/components/button';
import { Spinner } from '@kstackz/expo-toolkit/components/spinner';
import { Text } from '@kstackz/expo-toolkit/components/text';
import { type ReactNode, useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  addUser,
  checkAgain,
  setBackend,
  takeLoginError,
  useBackend,
} from '../../ledger';
import { LedgerMark } from '../parts';

/** While Ledger asks who is signed in, opens a User's money, or signs out. */
export function Opening(props: {
  readonly name?: string | undefined;
  readonly signingOut?: boolean;
}) {
  return (
    <Card>
      <View
        accessibilityRole="progressbar"
        className="h-10 flex-row items-center gap-2"
      >
        <Spinner size="sm" />
        <Text muted className="text-sm">
          {props.signingOut
            ? 'Signing out…'
            : props.name === undefined
              ? 'Checking who is signed in…'
              : `Opening ${props.name}’s money…`}
        </Text>
      </View>
    </Card>
  );
}

/**
 * Nobody is signed in, or the sign-in service could not be reached. Each
 * Backend offers its own sign-in, and the way to the other Backend.
 */
export function SignedOut(props: { readonly unreachable: boolean }) {
  const backend = useBackend();
  if (backend === 'local') {
    return (
      <Card>
        <Button onPress={() => void addUser()}>Sign in</Button>
        <OtherBackend to="remote" />
      </Card>
    );
  }
  return (
    <Card>
      {props.unreachable ? (
        <>
          <Text className="text-sm text-destructive" accessibilityRole="alert">
            Couldn’t reach the sign-in service.
          </Text>
          <Button variant="outline" onPress={checkAgain}>
            Try again
          </Button>
        </>
      ) : (
        <GoogleSignIn />
      )}
      <OtherBackend to="local" />
    </Card>
  );
}

// Opens the system sign-in sheet; says why when it comes back without a
// User, unless the sheet was closed.
function GoogleSignIn() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const start = async () => {
    setPending(true);
    setError(undefined);
    try {
      await addUser();
      const taken = await takeLoginError();
      if (taken !== null) {
        setError(taken.description ?? 'Sign in didn’t finish. Try again.');
      }
    } catch {
      setError('The sign-in service didn’t answer. Try again.');
    } finally {
      setPending(false);
    }
  };
  return (
    <View className="gap-3">
      <Button disabled={pending} onPress={() => void start()}>
        Sign in with Google
      </Button>
      {error !== undefined && (
        <Text className="text-sm text-destructive" accessibilityRole="alert">
          {error}
        </Text>
      )}
    </View>
  );
}

// The way from one Backend to the other.
function OtherBackend(props: { readonly to: 'local' | 'remote' }) {
  return (
    <View className="gap-1">
      <Text muted className="text-sm">
        {props.to === 'local'
          ? 'Or try Ledger on this phone, without an account.'
          : 'Or sign in with Google, to keep your money on every device.'}
      </Text>
      <Button
        variant="ghost"
        className="self-start px-0"
        labelClassName="text-primary underline"
        onPress={() => void setBackend(props.to)}
      >
        {props.to === 'local' ? 'Use the Local Backend' : 'Use Google'}
      </Button>
    </View>
  );
}

/** One card for every state before a Session, so nothing jumps between them. */
function Card(props: { readonly children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View
      className="flex-1 justify-center bg-background px-6"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
    >
      <View className="w-full max-w-sm gap-8 self-center">
        <View className="gap-4">
          <LedgerMark />
          <View className="gap-2">
            <Text weight="semibold" className="text-3xl">
              Ledger
            </Text>
            <Text muted>
              Write down what you spend and earn, and see where it goes. A thumb
              on a phone.
            </Text>
          </View>
        </View>
        <View className="min-h-10 gap-3">{props.children}</View>
      </View>
    </View>
  );
}
