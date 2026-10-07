import {
  bindingsOf,
  keys,
  keysOff,
  type Surface,
} from '@ledger/core/app/commands';
import { type ReactNode, useState } from 'react';

// A phone has no keyboard: every Command is given by a tap or a gesture.
const NO_KEYS = keysOff(bindingsOf({}));

/**
 * Ledger's Commands on a phone: the same Actions as the web, run by taps
 * and gestures through `keys.useRun`, with the keyboard listener off. The
 * app keeps the Active Surface, as the sheets open and close. Commands
 * make no sound on a phone: gestures answer with haptics instead.
 */
export function Commands(props: { readonly children: ReactNode }) {
  const [surface, setSurface] = useState<Surface>('home');
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
