import { PortalScope } from '@kstackz/expo-toolkit/components/portal-scope';
import { LocalSignIn } from '@kstackz/expo-toolkit/patterns/local-sign-in';
import { SessionProvider } from '@ledger/core/client/session';
import type { ReactNode } from 'react';
import { useApp, useLocalSignIn } from '../../ledger';
import { Commands } from './commands';
import { Frame } from './frame';
import { Opening, SignedOut } from './signed-out';
import { Splash } from './splash';

/**
 * The whole app around a Place: the open Session's, or what stands in for
 * it while Ledger finds who is signed in, under the Splash at launch. A new
 * User's Session starts the Place afresh.
 */
export function Shell(props: { readonly children: ReactNode }) {
  return (
    <>
      <Lifecycle>{props.children}</Lifecycle>
      <LocalSignInDialog />
      <Splash />
    </>
  );
}

function Lifecycle(props: { readonly children: ReactNode }) {
  const app = useApp();
  switch (app.kind) {
    case 'checking':
      return <Opening />;
    case 'signedOut':
      return <SignedOut unreachable={app.unreachable} />;
    case 'signingOut':
      return <Opening signingOut />;
    case 'opening':
      return <Opening name={app.user.user.name} />;
    case 'open':
      return (
        <SessionProvider key={app.user.user.id} session={app.session}>
          <Commands>
            {/* The Sidebar and sheets open inside the Session and its Commands. */}
            <PortalScope>
              <Frame>{props.children}</Frame>
            </PortalScope>
          </Commands>
        </SessionProvider>
      );
  }
}

// Who to try the Local Backend as, in one tap: the web's presets.
const PRESETS = [
  { email: 'ada@example.com', name: 'Ada Lovelace' },
  { email: 'grace@example.com', name: 'Grace Hopper' },
];

// Asks who signs in to the Local Backend, the first User or an Add User.
function LocalSignInDialog() {
  const { asking, answer } = useLocalSignIn();
  return (
    <LocalSignIn
      open={asking}
      presets={PRESETS}
      onChoose={answer}
      onCancel={() => answer(null)}
    />
  );
}
