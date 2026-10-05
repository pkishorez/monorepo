import { useSyncExternalStore } from 'react';
import { play, type SoundName } from '../kit/sound/index.ts';
import { type ActionId, keys } from './keys.ts';

// The sound of each Command; any other confirms.
const SOUNDS: Partial<Readonly<Record<ActionId, SoundName>>> = {
  next: 'tick',
  previous: 'tick',
  'palette.down': 'tick',
  'palette.up': 'tick',
  'sidebar.down': 'tick',
  'sidebar.up': 'tick',
  addEntry: 'open',
  openPalette: 'open',
  focusSidebar: 'open',
  'sidebar.leave': 'close',
  'add.cancel': 'close',
  'account.cancel': 'close',
  'palette.close': 'close',
  'settings.recording.cancel': 'close',
  'add.save': 'coin',
  theme: 'theme',
};

/** The last Command given, and when; any key or gesture. */
export type Given = { readonly id: ActionId; readonly at: number };

let given: Given | undefined;
const listeners = new Set<() => void>();

/** A Command was given: it sounds, and the Announcer shows it. */
export const announce = (id: ActionId) => {
  play(SOUNDS[id] ?? 'confirm');
  given = { id, at: performance.now() };
  for (const listener of listeners) listener();
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** The last Command given. */
export const useGiven = () =>
  useSyncExternalStore(
    subscribe,
    () => given,
    () => undefined,
  );

/**
 * Gives an Action its Handler, as `keys.useAction` does, and announces it
 * each time it runs, from a key or a gesture alike.
 */
export const useCommand = (
  id: ActionId,
  handler: () => void,
  options?: Parameters<typeof keys.useAction>[2],
) =>
  keys.useAction(
    id,
    () => {
      announce(id);
      handler();
    },
    options,
  );
