import { isApple, isModifier, nameOf } from '../key/index.ts';
import type { Shortcut } from './binding.ts';
import type { KeyName } from './notation.ts';

// Every key a Shortcut can name that is more than one character.
const NAMED = new Set<string>([
  'Enter',
  'Escape',
  'Tab',
  'Space',
  'Backspace',
  'Delete',
  'Insert',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Home',
  'End',
  'PageUp',
  'PageDown',
  'F1',
  'F2',
  'F3',
  'F4',
  'F5',
  'F6',
  'F7',
  'F8',
  'F9',
  'F10',
  'F11',
  'F12',
]);

const LETTER = /^[a-z]$/;
const CHARACTERS = '0123456789`~!@#$%^&*()-_=+[]{}\\|;:\'",<.>/?';

const isKeyName = (name: string): name is KeyName =>
  LETTER.test(name) ||
  (name.length === 1 && CHARACTERS.includes(name)) ||
  NAMED.has(name);

/** A key going down, as a browser's keyboard event says it. */
type Pressed = {
  readonly key: string;
  readonly code: string;
  readonly shiftKey: boolean;
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
  readonly metaKey: boolean;
};

/**
 * The Shortcut one key going down presses, named as the keys are matched,
 * so a recorded Shortcut is pressed by the same key again. Cmd on Apple
 * platforms is `mod`, unless Ctrl is down too; Ctrl stays `ctrl`. A digit
 * or symbol is the character typed, with no `shift`. Null for a modifier
 * alone, or a key no Shortcut can name, such as Caps Lock. `mac` decides
 * what `mod` is: this platform's by default.
 */
export const shortcutOf = (
  event: Pressed,
  options: { readonly mac?: boolean } = {},
): Shortcut | null => {
  const name = nameOf(event);
  if (isModifier(name) || !isKeyName(name)) return null;
  const mac = options.mac ?? isApple();
  const mod = mac && event.metaKey && !event.ctrlKey;
  return {
    type: 'shortcut',
    key: name,
    mod,
    ctrl: event.ctrlKey,
    alt: event.altKey,
    shift: event.shiftKey && (LETTER.test(name) || NAMED.has(name)),
    meta: event.metaKey && !mod,
  };
};
