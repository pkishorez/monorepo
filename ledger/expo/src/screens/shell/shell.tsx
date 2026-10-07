import { PortalScope } from '@kstackz/expo-toolkit/components/portal-scope';
import { LocalSignIn } from '@kstackz/expo-toolkit/recipes/local-sign-in';
import { SessionProvider } from '@ledger/core/app/session';
import type { ReactNode } from 'react';
import { SignedIn, useGate, useOpenSession } from '../../ledger';
import { AccountLost } from './account-lost';
import { Commands } from './commands';
import { Frame } from './frame';
import { Opening, SignedOut, Unopenable } from './signed-out';
import { Splash } from './splash';

/**
 * The whole app around a Place: the open Session's, or what stands in for
 * it while Ledger finds who is signed in, under the Splash at launch. A new
 * User's Session starts the Place afresh: everything inside SignedIn
 * remounts on a Switch User.
 */
export function Shell(props: { readonly children: ReactNode }) {
  return (
    <>
      <SignedIn
        fallback={(view) => {
          switch (view.kind) {
            case 'checking':
              return <Opening />;
            case 'signedOut':
              return <SignedOut unreachable={view.unreachable} />;
            case 'signingOut':
              return <Opening signingOut />;
            case 'opening':
              return <Opening name={view.account.user.name} />;
            case 'unopenable':
              return <Unopenable name={view.account.user.name} />;
          }
        }}
      >
        <Open>{props.children}</Open>
      </SignedIn>
      <LocalSignInDialog />
      <AccountLost />
      <Splash />
    </>
  );
}

// The open User's Ledger: their Session, the Commands, and the Frame.
function Open(props: { readonly children: ReactNode }) {
  return (
    <SessionProvider session={useOpenSession()}>
      <Commands>
        {/* The Sidebar and sheets open inside the Session and its Commands. */}
        <PortalScope>
          <Frame>{props.children}</Frame>
        </PortalScope>
      </Commands>
    </SessionProvider>
  );
}

// Who to try the device Backend as, in one tap: the web's presets.
const PRESETS = [
  { email: 'ada@example.com', name: 'Ada Lovelace' },
  { email: 'grace@example.com', name: 'Grace Hopper' },
];

// Asks who signs in to the device Backend, the first User or an Add User.
function LocalSignInDialog() {
  const { asking, answer } = useGate().localSignIn;
  return (
    <LocalSignIn
      open={asking}
      presets={PRESETS}
      onChoose={answer}
      onCancel={() => answer(null)}
    />
  );
}
