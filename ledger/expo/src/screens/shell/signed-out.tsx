import { Button } from '@kstackz/expo-toolkit/components/button';
import { Spinner } from '@kstackz/expo-toolkit/components/spinner';
import { Text } from '@kstackz/expo-toolkit/components/text';
import { type ReactNode, useEffect, useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useGate } from '../../ledger';
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
  const { backend, checkAgain, signIn } = useGate();
  if (backend === 'device') {
    return (
      <Card>
        <Button onPress={() => void signIn()}>Sign in</Button>
        <OtherBackend to="cloud" />
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
      <OtherBackend to="device" />
    </Card>
  );
}

// Opens the system sign-in sheet; says why when it comes back without a
// User, unless the sheet was closed.
function GoogleSignIn() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const { notice, dismissNotice, signIn } = useGate();
  useEffect(() => {
    if (notice?.kind !== 'loginError') return;
    setError(notice.error.description ?? 'Sign in didn’t finish. Try again.');
    dismissNotice();
  }, [notice, dismissNotice]);
  const start = async () => {
    setPending(true);
    setError(undefined);
    try {
      await signIn();
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

/** A User whose money would not open on this phone, twice running. */
export function Unopenable(props: { readonly name: string }) {
  const { retry, signOut } = useGate();
  return (
    <Card>
      <Text className="text-sm text-destructive" accessibilityRole="alert">
        Couldn’t open {props.name}’s money on this phone.
      </Text>
      <Button onPress={retry}>Try again</Button>
      <Button variant="outline" onPress={() => void signOut()}>
        {`Sign out ${props.name}`}
      </Button>
    </Card>
  );
}

// The way from one Backend to the other.
function OtherBackend(props: { readonly to: 'device' | 'cloud' }) {
  const { setBackend } = useGate();
  return (
    <View className="gap-1">
      <Text muted className="text-sm">
        {props.to === 'device'
          ? 'Or try Ledger on this phone, without an account.'
          : 'Or sign in with Google, to keep your money on every device.'}
      </Text>
      <Button
        variant="ghost"
        className="self-start px-0"
        labelClassName="text-primary underline"
        onPress={() => void setBackend(props.to)}
      >
        {props.to === 'device' ? 'Use this device' : 'Use Google'}
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
