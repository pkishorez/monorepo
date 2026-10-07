import { type ReactNode, useEffect, useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../../components/button';
import { Spinner } from '../../components/spinner';
import { Text } from '../../components/text';

/** What stands in for an app while no Account is open, one per state. */
export type GateScreen =
  | { kind: 'checking' }
  | { kind: 'signingOut' }
  | { kind: 'opening'; name: string }
  | { kind: 'signedOut'; unreachable: boolean }
  | { kind: 'unopenable'; name: string };

export interface GateScreensProps {
  /** The app's name, as every screen titles it. */
  title: string;
  /** One line on what the app is for. */
  description?: string;
  /** The app's mark, above its name. */
  mark?: ReactNode;
  screen: GateScreen;
  /** The Backend running, and whether the app has a device Backend to
   * offer. */
  backend: 'cloud' | 'device' | null;
  hasDevice: boolean;
  /** Why the last sign-in came back with nobody, shown once. */
  loginError?: string | null;
  onLoginErrorShown?: () => void;
  onSignIn: () => Promise<void> | void;
  onCheckAgain: () => void;
  onRetry: () => void;
  onSignOut: () => void;
  onBackend: (backend: 'cloud' | 'device') => void;
}

/**
 * Every screen an app shows on a phone before an Account is open: checking
 * who is signed in, opening an Account, signing out, signed out (the system
 * sign-in sheet on the cloud Backend, a name on the device Backend, and the
 * way to the other), and an Account that would not open. One card for all
 * of them, so nothing jumps between them. An Account Lost is the Account
 * Lost recipe; the web's twin is web-platform's gate-screens.
 */
export function GateScreens(props: GateScreensProps) {
  const { screen, title } = props;
  switch (screen.kind) {
    case 'checking':
    case 'signingOut':
    case 'opening':
      return (
        <Card {...props}>
          <View
            accessibilityRole="progressbar"
            className="h-10 flex-row items-center gap-2"
          >
            <Spinner size="sm" />
            <Text muted className="text-sm">
              {screen.kind === 'signingOut'
                ? 'Signing out…'
                : screen.kind === 'checking'
                  ? 'Checking who is signed in…'
                  : `Opening ${screen.name}’s ${title}…`}
            </Text>
          </View>
        </Card>
      );
    case 'unopenable':
      return (
        <Card {...props}>
          <Text className="text-sm text-destructive" accessibilityRole="alert">
            Couldn’t open {screen.name}’s {title} on this phone.
          </Text>
          <Button onPress={props.onRetry}>Try again</Button>
          <Button variant="outline" onPress={props.onSignOut}>
            {`Sign out ${screen.name}`}
          </Button>
        </Card>
      );
    case 'signedOut':
      return <SignedOut {...props} unreachable={screen.unreachable} />;
  }
}

function SignedOut(props: GateScreensProps & { unreachable: boolean }) {
  if (props.backend === 'device') {
    return (
      <Card {...props}>
        <Button onPress={() => void props.onSignIn()}>Sign in</Button>
        <OtherBackend {...props} to="cloud" />
      </Card>
    );
  }
  return (
    <Card {...props}>
      {props.unreachable ? (
        <>
          <Text className="text-sm text-destructive" accessibilityRole="alert">
            Couldn’t reach the sign-in service.
          </Text>
          <Button variant="outline" onPress={props.onCheckAgain}>
            Try again
          </Button>
        </>
      ) : (
        <GoogleSignIn {...props} />
      )}
      {props.hasDevice && <OtherBackend {...props} to="device" />}
    </Card>
  );
}

// Opens the system sign-in sheet; says why when it comes back without a
// User, unless the sheet was closed.
function GoogleSignIn(props: GateScreensProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const { loginError, onLoginErrorShown } = props;
  useEffect(() => {
    if (loginError == null) return;
    setError(loginError);
    onLoginErrorShown?.();
  }, [loginError, onLoginErrorShown]);
  const start = async () => {
    setPending(true);
    setError(undefined);
    try {
      await props.onSignIn();
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
function OtherBackend(props: GateScreensProps & { to: 'device' | 'cloud' }) {
  return (
    <View className="gap-1">
      <Text muted className="text-sm">
        {props.to === 'device'
          ? `Or try ${props.title} on this phone, without an account.`
          : 'Or sign in with Google, to keep everything on every device.'}
      </Text>
      <Button
        variant="ghost"
        className="self-start px-0"
        labelClassName="text-primary underline"
        onPress={() => props.onBackend(props.to)}
      >
        {props.to === 'device' ? 'Use this device' : 'Use Google'}
      </Button>
    </View>
  );
}

function Card(props: GateScreensProps & { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View
      className="flex-1 justify-center bg-background px-6"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
    >
      <View className="w-full max-w-sm gap-8 self-center">
        <View className="gap-4">
          {props.mark}
          <View className="gap-2">
            <Text weight="semibold" className="text-3xl">
              {props.title}
            </Text>
            {props.description !== undefined && (
              <Text muted>{props.description}</Text>
            )}
          </View>
        </View>
        <View className="min-h-10 gap-3">{props.children}</View>
      </View>
    </View>
  );
}
