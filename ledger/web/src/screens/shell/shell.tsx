import { type ReactNode, useEffect, useMemo, useState } from 'react';
import {
  bindingsOf,
  keys,
  keysOff,
  setCommandSounds,
  type Surface,
} from '@ledger/core/app/commands';
import { LocalSignIn } from '@kstackz/web-toolkit/recipes/local-sign-in';
import { SignedIn, useGate, useOpenSession, useSettings } from '../../app.ts';
import { SessionProvider } from '@ledger/core/app/session';
import { play } from '@kstackz/web-toolkit/feedback';
import { Frame } from './frame.tsx';
import { AccountLost } from './account-lost.tsx';
import { Opening, SignedOut, Unopenable } from './signed-out.tsx';

/**
 * The whole app around a Place: the open Session's, or what stands in for
 * it while Ledger finds who is signed in. A new User's Session starts the
 * Place afresh: everything inside SignedIn remounts on a Switch User.
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
    </>
  );
}

// The open User's Ledger: their Session, the keys, and the Frame.
function Open(props: { readonly children: ReactNode }) {
  return (
    <SessionProvider session={useOpenSession()}>
      <Keys>
        <Frame>{props.children}</Frame>
      </Keys>
    </SessionProvider>
  );
}

// Who to try the device Backend as, in one tap.
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

// The keys of Ledger: the app keeps the Active Surface, and the device's own
// keys, sound, and whether Keys and Gestures are on come from its Settings.
// The document is marked for what is off, so CSS hides the hints of it.
function Keys(props: { readonly children: ReactNode }) {
  const [settings] = useSettings();
  const [surface, setSurface] = useState<Surface>('home');
  const { keysOn, gesturesOn } = settings;
  const bindings = useMemo(() => {
    const own = bindingsOf(settings.keys);
    return keysOn ? own : keysOff(own);
  }, [settings.keys, keysOn]);
  useEffect(
    () => setCommandSounds(settings.sound ? play : null),
    [settings.sound],
  );
  useEffect(() => {
    const html = document.documentElement;
    html.toggleAttribute('data-keys-off', !keysOn);
    html.toggleAttribute('data-gestures-off', !gesturesOn);
  }, [keysOn, gesturesOn]);
  return (
    <keys.Provider
      surface={surface}
      onSurfaceChange={setSurface}
      bindings={bindings}
    >
      {props.children}
    </keys.Provider>
  );
}
