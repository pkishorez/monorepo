import { type Binding, sequence, shortcut } from '../../core/binding/index.ts';
import type { Repeat } from '../../core/provider/index.ts';

/** Something the user can do from a Surface, as the definition names it. */
export type ActionDefinition = {
  /**
   * Its keys: `'j'`, `'mod+k'`, a Sequence with a space, `'g g'`, or a
   * list of alternatives.
   */
  readonly keys: string | ReadonlyArray<string>;
  /** What it does, for people: a help sheet or a command palette. */
  readonly label: string;
  /** Whether it also works with Vim Mode off: false by default. */
  readonly always?: boolean;
  /** Whether a key without `mod` also works while typing in a field. */
  readonly inField?: boolean;
  /**
   * Whether it runs again while its last key stays down; an object sets its
   * own delay or interval over the provider's `timing`.
   */
  readonly repeat?: Repeat;
  /** The Surface it enters, after its Handler, if any, runs. */
  readonly enters?: string;
};

/** A part of the app the user works in: its Actions and the Surfaces in it. */
export type SurfaceDefinition = {
  /** A name for people, as in a status bar: its name by default. */
  readonly label?: string;
  /**
   * Whether it can be the Active Surface: true by default. False, it only
   * holds Actions for the Surfaces in it, and Escape passes over it.
   */
  readonly focusable?: boolean;
  /**
   * No key climbs out of it, and leaving it goes back to where it was
   * entered from, such as a dialog or a palette.
   */
  readonly isolated?: boolean;
  /** Active when the app starts: one per definition. */
  readonly initial?: boolean;
  readonly actions?: { readonly [name: string]: ActionDefinition };
  readonly surfaces?: { readonly [name: string]: SurfaceDefinition };
};

/** An app's whole keyboard: its outermost Surfaces, by name. */
export type Definition = { readonly [name: string]: SurfaceDefinition };

type SurfacesOf<S> = S extends { readonly surfaces: infer C } ? C : {};
type ActionsOf<S> = S extends { readonly actions: infer A } ? A : {};

// How deep the types look into a definition: ten Surfaces down.
type Deeper = [never, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

/** Every Surface's name in a definition, from anywhere in its tree. */
export type SurfaceName<D, Depth extends number = 10> = [Depth] extends [never]
  ? never
  : {
      [K in keyof D & string]: K | SurfaceName<SurfacesOf<D[K]>, Deeper[Depth]>;
    }[keyof D & string];

/** Every Action's id in a definition: `'<surface>.<action>'`. */
export type ActionId<D, Depth extends number = 10> = [Depth] extends [never]
  ? never
  : {
      [K in keyof D & string]:
        | `${K}.${keyof ActionsOf<D[K]> & string}`
        | ActionId<SurfacesOf<D[K]>, Deeper[Depth]>;
    }[keyof D & string];

// Each name with where it sits, so a name in two places can be found.
type Placed<D, P extends string = '', Depth extends number = 10> = [
  Depth,
] extends [never]
  ? never
  : {
      [K in keyof D & string]:
        | readonly [K, `${P}/${K}`]
        | Placed<SurfacesOf<D[K]>, `${P}/${K}`, Deeper[Depth]>;
    }[keyof D & string];

type Twice<E, All> = E extends readonly [infer N, infer P]
  ? [Exclude<Extract<All, readonly [N, unknown]>, readonly [N, P]>] extends [
      never,
    ]
    ? never
    : N
  : never;

/** The Surface names a definition uses twice. */
export type Duplicates<D> = Twice<Placed<D>, Placed<D>>;

// Checks each `enters` against `Names`, every Surface name.
type Entered<D, Names, Depth extends number = 10> = [Depth] extends [never]
  ? unknown
  : {
      readonly [K in keyof D]: {
        readonly actions?: {
          readonly [A in keyof ActionsOf<D[K]>]: {
            readonly enters?: Names;
          };
        };
        readonly surfaces?: Entered<SurfacesOf<D[K]>, Names, Deeper[Depth]>;
      };
    };

/**
 * What a definition must also be: every `enters` names a Surface, and no
 * Surface name is used twice.
 */
export type Checked<D> = Entered<D, SurfaceName<D>> &
  ([Duplicates<D>] extends [never]
    ? unknown
    : { readonly 'Surface names used twice': Duplicates<D> });

/** One Surface, flattened out of the definition. */
export type FlatSurface = {
  readonly name: string;
  readonly parent: string | null;
  readonly label: string;
  readonly focusable: boolean;
  readonly isolated: boolean;
};

/** One Action, flattened out of the definition. */
export type FlatAction = {
  readonly id: string;
  readonly surface: string;
  readonly label: string;
  /** Its default keys, as written. */
  readonly keys: ReadonlyArray<string>;
  readonly always: boolean;
  readonly inField: boolean;
  readonly repeat: Repeat;
  readonly enters: string | undefined;
};

/** The keys of an Action, as Shortcuts and Sequences; throws on a typo. */
export const bindingsOf = (
  keys: string | ReadonlyArray<string>,
): ReadonlyArray<Binding> =>
  (typeof keys === 'string' ? [keys] : keys).map((written) =>
    written.includes(' ')
      ? sequence(written.split(' ') as never)
      : shortcut(written as never),
  );

const NAME = /^[^.\s]+$/;

const fail = (message: string): never => {
  throw new Error(`use-keys: ${message}`);
};

/**
 * The definition as flat lists, in the order written, and the Initial
 * Surface. Throws on a name used twice or holding a dot or a space, an
 * `enters` naming no Surface, keys that are no Shortcut or Sequence, more
 * than one Initial Surface, or none that can be Active.
 */
export const flatten = (definition: Definition) => {
  const surfaces = new Map<string, FlatSurface>();
  const actions = new Map<string, FlatAction>();
  const initial: string[] = [];

  const visit = (
    level: { readonly [name: string]: SurfaceDefinition },
    parent: string | null,
  ) => {
    for (const [name, surface] of Object.entries(level)) {
      if (!NAME.test(name)) fail(`"${name}" is no Surface name.`);
      if (surfaces.has(name)) fail(`two Surfaces are called "${name}".`);
      const focusable = surface.focusable !== false;
      surfaces.set(name, {
        name,
        parent,
        label: surface.label ?? name,
        focusable,
        isolated: surface.isolated === true,
      });
      if (surface.initial === true) {
        if (!focusable) fail(`"${name}" is initial but not focusable.`);
        initial.push(name);
      }
      for (const [action, each] of Object.entries(surface.actions ?? {})) {
        if (!NAME.test(action)) fail(`"${action}" is no Action name.`);
        const keys = typeof each.keys === 'string' ? [each.keys] : each.keys;
        bindingsOf(keys);
        actions.set(`${name}.${action}`, {
          id: `${name}.${action}`,
          surface: name,
          label: each.label,
          keys,
          always: each.always === true,
          inField: each.inField === true,
          repeat: each.repeat ?? false,
          enters: each.enters,
        });
      }
      visit(surface.surfaces ?? {}, name);
    }
  };
  visit(definition, null);

  for (const action of actions.values()) {
    if (action.enters !== undefined && !surfaces.has(action.enters)) {
      fail(`"${action.id}" enters "${action.enters}", which is no Surface.`);
    }
  }
  if (initial.length > 1) {
    fail(`more than one Surface is initial: "${initial.join('", "')}".`);
  }
  const first =
    initial[0] ??
    [...surfaces.values()].find((surface) => surface.focusable)?.name ??
    fail('no Surface can be Active: every one is focusable: false.');
  return { surfaces, actions, initial: first };
};

export type Flat = ReturnType<typeof flatten>;
