import { type ReactNode, useEffect, useMemo, useState } from 'react';
import {
  bindingsOf,
  keys,
  keysOff,
  setCommandSounds,
  type Surface,
} from '@ledger/core/commands';
import { SignedIn, useSettings } from '../../app.ts';
import { play } from '@kstackz/web-platform/feedback';
import { Frame } from './frame.tsx';

/**
 * The whole app around a Place, for the open User: the keys and the Frame.
 * Until a User is open, the Web Platform shows where sign-in stands. A new
 * User's Session starts the Place afresh: everything inside SignedIn
 * remounts on a Switch User.
 */
export function Shell(props: { readonly children: ReactNode }) {
  return (
    <SignedIn>
      <Keys>
        <Frame>{props.children}</Frame>
      </Keys>
    </SignedIn>
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
