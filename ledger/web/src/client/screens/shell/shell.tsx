import { type ReactNode, useEffect, useMemo, useState } from 'react';
import {
  bindingsOf,
  keys,
  keysOff,
  setCommandSounds,
  type Surface,
} from '@ledger/core/client/commands';
import { LocalSignIn } from '@kstackz/ui-toolkit/components/blocks/auth';
import { useApp, useLocalSignIn, useSettings } from '../../app/index.ts';
import { SessionProvider } from '@ledger/core/client/session';
import { play } from '../../kit/sound/index.ts';
import { Frame } from './frame.tsx';
import { Opening, SignedOut } from './signed-out.tsx';

/**
 * The whole app around a Place: the open Session's, or what stands in for
 * it while Ledger finds who is signed in. A new User's Session starts the
 * Place afresh.
 */
export function Shell(props: { readonly children: ReactNode }) {
  return (
    <>
      <Lifecycle>{props.children}</Lifecycle>
      <LocalSignInDialog />
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
          <Keys>
            <Frame>{props.children}</Frame>
          </Keys>
        </SessionProvider>
      );
  }
}

// Who to try the Local Backend as, in one tap.
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

// The keys of Ledger: the app keeps the Active Surface, and the device's own
// keys, sound, and whether Keys and Gestures are on come from its Settings.
// The document is marked for what is off, so CSS hides the hints of it.
function Keys(props: { readonly children: ReactNode }) {
  const settings = useSettings();
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
