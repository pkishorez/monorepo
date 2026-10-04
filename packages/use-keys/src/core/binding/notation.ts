// prettier-ignore
type Letter =
  | 'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g' | 'h' | 'i' | 'j' | 'k' | 'l' | 'm'
  | 'n' | 'o' | 'p' | 'q' | 'r' | 's' | 't' | 'u' | 'v' | 'w' | 'x' | 'y' | 'z';

// prettier-ignore
export type Character =
  | '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'
  | '`' | '~' | '!' | '@' | '#' | '$' | '%' | '^' | '&' | '*' | '(' | ')'
  | '-' | '_' | '=' | '+' | '[' | ']' | '{' | '}' | '\\' | '|'
  | ';' | ':' | "'" | '"' | ',' | '<' | '.' | '>' | '/' | '?';

// prettier-ignore
type NamedKey =
  | 'Enter' | 'Escape' | 'Tab' | 'Space' | 'Backspace' | 'Delete' | 'Insert'
  | 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight'
  | 'Home' | 'End' | 'PageUp' | 'PageDown'
  | 'F1' | 'F2' | 'F3' | 'F4' | 'F5' | 'F6'
  | 'F7' | 'F8' | 'F9' | 'F10' | 'F11' | 'F12';

/** What a key means, as a Shortcut names it: `'k'`, `'?'`, `'Enter'`. */
export type KeyName = Letter | Character | NamedKey;

/**
 * Whether a modifier must be down: `true` either side, `'left'` or
 * `'right'` that side, `'any'` either way. `false`: it must be up.
 */
export type Side = boolean | 'any' | 'left' | 'right';

type Modifiers = { readonly alt?: Side } & (
  | {
      /** Cmd on Apple platforms, Ctrl elsewhere. */
      readonly mod: Side;
      readonly ctrl?: never;
      readonly meta?: never;
    }
  | { readonly mod?: never; readonly ctrl?: Side; readonly meta?: Side }
);

/**
 * A Shortcut written as an object. A letter is lowercase, with `shift` for
 * its capital; a digit or symbol is the character typed, so it takes no
 * `shift`. A modifier left out must be up.
 */
export type ShortcutObject = Modifiers &
  (
    | { readonly key: Letter | NamedKey; readonly shift?: Side }
    | { readonly key: Character; readonly shift?: never }
  );

// Modifiers written before the key, always in this order.
type Held =
  | ''
  | `${'mod+' | ''}${'alt+' | ''}`
  | `${'ctrl+' | ''}${'alt+' | ''}${'meta+' | ''}`;
type HeldShift =
  | `${'mod+' | ''}${'alt+' | ''}shift+`
  | `${'ctrl+' | ''}${'alt+' | ''}shift+${'meta+' | ''}`;

/**
 * A Shortcut written as a string: its modifiers, then its key, joined by
 * `+`, such as `'mod+k'`, `'shift+ArrowDown'` or `'mod++'`. Modifiers come
 * in the order `mod`/`ctrl`, `alt`, `shift`, `meta`.
 */
export type ShortcutString =
  | `${Held}${KeyName}`
  | `${HeldShift}${Letter | NamedKey}`;

type Steps<T extends string> = T extends `${infer Head} ${infer Rest}`
  ? [Head, ...Steps<Rest>]
  : [T];
type AllShortcuts<T> = T extends [infer Head, ...infer Rest]
  ? Head extends ShortcutString
    ? AllShortcuts<Rest>
    : false
  : true;

/**
 * `T` when it is a Sequence written as a string: two or more Shortcut
 * strings, one space between each, such as `'g g'` or `'mod+k mod+s'`.
 */
export type SequenceString<T extends string> = T extends `${string} ${string}`
  ? AllShortcuts<Steps<T>> extends true
    ? T
    : never
  : never;

/** A step of a Sequence written as an object: each a Shortcut. */
export type SequenceSteps = readonly [
  ShortcutString | ShortcutObject,
  ShortcutString | ShortcutObject,
  ...ReadonlyArray<ShortcutString | ShortcutObject>,
];
