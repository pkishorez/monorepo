import type { Binding, Shortcut } from '@kstackz/use-keys';
import type { Bindings } from './keys.ts';

const STORAGE = 'keyboard:bindings';

/** The user's own keys, as the browser keeps them; none on the server. */
export const loadBindings = (): Bindings => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE) ?? '{}') as Bindings;
  } catch {
    return {};
  }
};

export const saveBindings = (bindings: Bindings) =>
  localStorage.setItem(STORAGE, JSON.stringify(bindings));

export const mac = () =>
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad|iPod/.test(navigator.platform);

/**
 * One recorded key, as a Shortcut: Cmd on a Mac or Ctrl elsewhere becomes
 * `mod`, so the key works on both.
 */
export const recorded = (name: string, held: ReadonlySet<string>): Shortcut => {
  const apple = mac();
  return {
    type: 'shortcut',
    key: name as Shortcut['key'],
    mod: held.has(apple ? 'Meta' : 'Control'),
    ctrl: apple && held.has('Control'),
    alt: held.has('Alt'),
    // A symbol is the character typed, so Shift is part of it.
    shift: held.has('Shift') && /^[a-z]$|^[A-Z]/.test(name),
    meta: !apple && held.has('Meta'),
  };
};

/** Recorded steps: one is a Shortcut, more a Sequence. */
export const bindingOf = (steps: ReadonlyArray<Shortcut>): Binding =>
  steps.length === 1 ? (steps[0] as Shortcut) : { type: 'sequence', steps };
