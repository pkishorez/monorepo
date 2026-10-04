import {
  isModifier,
  type Keys,
  type Modifier,
  MODIFIERS,
} from '../key/index.ts';

// prettier-ignore
type Letter =
  | 'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g' | 'h' | 'i' | 'j' | 'k' | 'l' | 'm'
  | 'n' | 'o' | 'p' | 'q' | 'r' | 's' | 't' | 'u' | 'v' | 'w' | 'x' | 'y' | 'z';

// prettier-ignore
type Character =
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

/**
 * Whether a modifier must be down: `true` either side, `'left'` or
 * `'right'` that side, `'any'` either way. Left out or `false`: it must
 * be up.
 */
type Side = boolean | 'any' | 'left' | 'right';

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
 * One key going down while exactly these modifiers are down. A letter is
 * written lowercase, with `shift` for its capital; a digit or symbol is the
 * character typed, so it takes no `shift`.
 */
export type Shortcut = Modifiers &
  (
    | { readonly key: Letter | NamedKey; readonly shift?: Side }
    | { readonly key: Character; readonly shift?: never }
  );

/** A Shortcut, or a bare key for one with no modifiers. */
export type Step = Shortcut | Letter | Character | NamedKey;

export type Exact = {
  readonly key: string;
  readonly sides: Readonly<Record<Modifier, Side>>;
};

/** A Step with every modifier spelled out, `mod` resolved for the platform. */
export const exact = (step: Step, mac: boolean): Exact => {
  const shortcut = (
    typeof step === 'string' ? { key: step } : step
  ) as Shortcut;
  const symbol = shortcut.key.length === 1 && !/[a-z]/.test(shortcut.key);
  const mod = shortcut.mod ?? false;
  return {
    key: shortcut.key,
    sides: {
      Shift: symbol ? 'any' : (shortcut.shift ?? false),
      Control: mac ? (shortcut.ctrl ?? false) : (shortcut.ctrl ?? mod),
      Alt: shortcut.alt ?? false,
      Meta: mac ? (shortcut.meta ?? mod) : (shortcut.meta ?? false),
    },
  };
};

// Which of a modifier's sides are down: left, right, and one whose side is
// unknown, such as a modifier the browser says is down but never sent.
type Down = { left: boolean; right: boolean; unknown: boolean };

const down = (keys: Keys): Record<Modifier, Down> => {
  const state = Object.fromEntries(
    MODIFIERS.map((modifier) => [
      modifier,
      { left: false, right: false, unknown: false },
    ]),
  ) as Record<Modifier, Down>;
  for (const key of keys) {
    if (key.upAt !== null || !isModifier(key.name)) continue;
    const sides = state[key.name];
    if (key.code.endsWith('Left')) sides.left = true;
    else if (key.code.endsWith('Right')) sides.right = true;
    else sides.unknown = true;
  }
  return state;
};

const allows = (side: Side, state: Down) => {
  if (side === 'any') return true;
  if (side === 'left') return state.left;
  if (side === 'right') return state.right;
  const any = state.left || state.right || state.unknown;
  return side ? any : !any;
};

/** Whether `name` going down, with `keys` down, presses `step`. */
export const presses = (step: Exact, name: string, keys: Keys) => {
  if (step.key !== name) return false;
  const state = down(keys);
  return MODIFIERS.every((modifier) =>
    allows(step.sides[modifier], state[modifier]),
  );
};

/** Whether `step` holds Ctrl, Alt or Cmd, so it may be pressed in Text Entry. */
export const commands = (step: Exact) =>
  (['Control', 'Alt', 'Meta'] as const).some((modifier) => {
    const side = step.sides[modifier];
    return side !== false && side !== 'any';
  });

// The states a Side allows, as none, left, right and both.
const STATES: Readonly<Record<`${Side}`, ReadonlyArray<number>>> = {
  false: [0],
  true: [1, 2, 3],
  any: [0, 1, 2, 3],
  left: [1, 3],
  right: [2, 3],
};

/** Whether one press could press both steps. */
export const overlaps = (a: Exact, b: Exact) =>
  a.key === b.key &&
  MODIFIERS.every((modifier) => {
    const states = STATES[`${b.sides[modifier]}`];
    return STATES[`${a.sides[modifier]}`].some((state) =>
      states.includes(state),
    );
  });

const SHOWN = ['mod', 'ctrl', 'alt', 'shift', 'meta'] as const;

/** A Sequence as people write it: `mod+k`, `g g`. */
export const describe = (path: ReadonlyArray<Step>) =>
  path
    .map((step) => {
      if (typeof step === 'string') return step;
      const held = SHOWN.flatMap((field) => {
        const side = step[field];
        if (side === undefined || side === false) return [];
        return [side === true ? field : `${field}(${side})`];
      });
      return [...held, step.key].join('+');
    })
    .join(' ');
