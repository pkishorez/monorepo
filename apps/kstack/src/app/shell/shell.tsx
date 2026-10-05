import { type ReactNode, useEffect, useMemo, useState } from 'react';
import {
  bindingsOf,
  keys,
  keysOff,
  type Surface,
} from '../../commands/index.ts';
import {
  type LedgerHost,
  LedgerProvider,
  useMoney,
} from '../../client/data/index.ts';
import {
  SignedIn,
  type User,
  UserProvider,
} from '../../client/session/index.ts';
import { setSound } from '../../kit/sound/index.ts';
import { Frame } from './frame.tsx';

/** The whole app around a Place, for whoever signs in. */
export function Shell(props: { readonly children: ReactNode }) {
  return (
    <SignedIn>
      {(user) => <Ledger user={user}>{props.children}</Ledger>}
    </SignedIn>
  );
}

/**
 * The whole app around a Place, for one user: their money from this
 * browser's copy, the keys with their own Bindings, and the frame. `host`
 * says where the money is kept; the browser and the server unless set.
 */
export function Ledger(props: {
  readonly user: User;
  readonly host?: LedgerHost;
  readonly children: ReactNode;
}) {
  return (
    <UserProvider user={props.user}>
      <LedgerProvider
        key={props.user.id}
        userId={props.user.id}
        host={props.host}
      >
        <Keys>
          <Frame>{props.children}</Frame>
        </Keys>
      </LedgerProvider>
    </UserProvider>
  );
}

// The keys of Ledger: the app keeps the Active Surface, and the user's own
// keys, sound, and whether Keys and Gestures are on come from their
// Preferences. The document is marked for what is off, so CSS hides the
// hints of it.
function Keys(props: { readonly children: ReactNode }) {
  const { preferences } = useMoney();
  const [surface, setSurface] = useState<Surface>('home');
  const keysOn = preferences.keysOn !== false;
  const gesturesOn = preferences.gesturesOn !== false;
  const bindings = useMemo(() => {
    const own = bindingsOf(preferences.keys);
    return keysOn ? own : keysOff(own);
  }, [preferences.keys, keysOn]);
  useEffect(() => setSound(preferences.sound), [preferences.sound]);
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
