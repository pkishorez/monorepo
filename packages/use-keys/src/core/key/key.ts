/**
 * One press of one key, from going down to lifting. `code` is the physical
 * key (`'KeyA'`, `'ShiftLeft'`), `name` what it means (`'a'`, `'Shift'`,
 * `'?'`, `'Enter'`). Times are ms from the first Key of the Keys going down.
 * Whether it is down, and how long it was held, follow from them.
 */
export type Key = {
  readonly code: string;
  readonly name: string;
  readonly downAt: number;
  readonly upAt: number | null;
};

/** Every Key from the first going down until the last lifts, in order. */
export type Keys = ReadonlyArray<Key>;

export type Modifier = 'Shift' | 'Control' | 'Alt' | 'Meta';

const MODIFIERS: ReadonlySet<string> = new Set<Modifier>([
  'Shift',
  'Control',
  'Alt',
  'Meta',
]);

export const isModifier = (name: string): name is Modifier =>
  MODIFIERS.has(name);

const LETTER = /^[a-z]$/i;
const LETTER_CODE = /^Key([A-Z])$/;

/**
 * What a key means, from a browser event's `key` and `code`:
 * - a letter is lowercase, whatever Shift or Caps Lock did; when the layout
 *   or Option types something else on a letter key, it is that key's letter;
 * - a digit or symbol is the character typed;
 * - any other key is its name, and the space bar is `'Space'`.
 */
export const nameOf = (event: {
  readonly key: string;
  readonly code: string;
}): string => {
  const { key, code } = event;
  if (LETTER.test(key)) return key.toLowerCase();
  const letter = LETTER_CODE.exec(code)?.[1];
  if (letter !== undefined) return letter.toLowerCase();
  if (key === ' ') return 'Space';
  if (key === 'OS') return 'Meta';
  if (key === 'Unidentified' || key === '') return code;
  return key;
};

/** The Keys still down. */
export const held = (keys: Keys): Keys =>
  keys.filter((key) => key.upAt === null);
