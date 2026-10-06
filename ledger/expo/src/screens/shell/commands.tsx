import {
  bindingsOf,
  keys,
  keysOff,
  setCommandSounds,
  type Surface,
} from '@ledger/core/client/commands';
import { type ReactNode, useEffect, useState } from 'react';
import { playCommand, useSettings } from '../../ledger';

// A phone has no keyboard: every Command is given by a tap or a gesture.
const NO_KEYS = keysOff(bindingsOf({}));

/**
 * Ledger's Commands on a phone: the same Actions as the web, run by taps
 * and gestures through `keys.useRun`, with the keyboard listener off. The
 * app keeps the Active Surface, as the sheets open and close; Commands
 * sound while the Sounds setting is on.
 */
export function Commands(props: { readonly children: ReactNode }) {
  const settings = useSettings();
  const [surface, setSurface] = useState<Surface>('home');
  useEffect(
    () => setCommandSounds(settings.sound ? playCommand : null),
    [settings.sound],
  );
  return (
    <keys.Provider
      enabled={false}
      surface={surface}
      onSurfaceChange={setSurface}
      bindings={NO_KEYS}
    >
      {props.children}
    </keys.Provider>
  );
}
