import { useSyncExternalStore } from 'react';
import { type ActionId, keys } from './keys.ts';

/** The sounds Commands make; each platform plays them its own way. */
export type CommandSound =
  | 'tick'
  | 'open'
  | 'close'
  | 'coin'
  | 'theme'
  | 'confirm';

// The sound of each Command; any other confirms.
const SOUNDS: Partial<Readonly<Record<ActionId, CommandSound>>> = {
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
// How Commands sound, while the user's Sounds setting is on.
let sounder: ((sound: CommandSound) => void) | null = null;
// Set while a gesture runs its Command, which has a sound of its own.
let quiet = false;

/** Plays the sounds of Commands with `play`, or turns them off with null. */
export const setCommandSounds = (
  play: ((sound: CommandSound) => void) | null,
) => {
  sounder = play;
};

/**
 * Runs a Command without its sound or Key Bar, as a gesture that showed
 * and sounded it already.
 */
export const quietly = (run: () => void) => {
  quiet = true;
  try {
    run();
  } finally {
    quiet = false;
  }
};

/** A Command was given: it sounds, and the Key Bar shows it. */
export const announce = (id: ActionId) => {
  if (quiet) return;
  sounder?.(SOUNDS[id] ?? 'confirm');
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
