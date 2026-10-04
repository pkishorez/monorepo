import type { Binding } from '../../core/binding/index.ts';

/** An Action as the central definition names it. */
export type ActionDefinition = {
  /** Its default Bindings: `shortcut()` and `sequence()` values. */
  readonly keys: ReadonlyArray<Binding>;
  /** What it does, for people: a cheat sheet or a command palette. */
  readonly description: string;
  /** Whether it Commits again while its last key stays down. */
  readonly repeat?: boolean;
  /** Whether its Bindings holding Ctrl, Alt or Cmd work in Text Entry. */
  readonly inTextEntry?: boolean;
};

/** A Surface: its Actions, and the Surfaces inside it. */
export type SurfaceDefinition = {
  readonly actions?: Readonly<Record<string, ActionDefinition>>;
  readonly surfaces?: Readonly<Record<string, SurfaceDefinition>>;
  /**
   * Whether the Surfaces around it stop working while it, or a Surface
   * inside it, is Active: false by default.
   */
  readonly isolated?: boolean;
  /**
   * Whether the Global Actions work while it, or a Surface inside it, is
   * Active: true by default.
   */
  readonly globals?: boolean;
};

/** The whole keyboard: the Global Actions, and the top Surfaces. */
export type Definition = {
  readonly actions?: Readonly<Record<string, ActionDefinition>>;
  readonly surfaces?: Readonly<Record<string, SurfaceDefinition>>;
};

/** One Action, found in the definition. */
export type ActionNode = {
  readonly id: string;
  /** Its Surface's id, or null for a Global Action. */
  readonly surface: string | null;
  readonly definition: ActionDefinition;
};

const NAME = /^[^.\s]+$/;

/**
 * Every Action in the definition, in the order written, and every
 * Surface by its id. Throws on a name with a dot or a space, or an Action
 * whose id is a Surface's.
 */
export const flatten = (definition: Definition) => {
  const actions: ActionNode[] = [];
  const surfaces = new Map<string, SurfaceDefinition>();
  const visit = (node: Definition, surface: string | null) => {
    const prefix = surface === null ? '' : `${surface}.`;
    for (const [name, action] of Object.entries(node.actions ?? {})) {
      if (!NAME.test(name)) throw new Error(`use-keys: "${name}" is no name.`);
      actions.push({ id: `${prefix}${name}`, surface, definition: action });
    }
    for (const [name, child] of Object.entries(node.surfaces ?? {})) {
      if (!NAME.test(name)) throw new Error(`use-keys: "${name}" is no name.`);
      surfaces.set(`${prefix}${name}`, child);
      visit(child, `${prefix}${name}`);
    }
  };
  visit(definition, null);
  for (const { id } of actions) {
    if (surfaces.has(id)) {
      throw new Error(`use-keys: "${id}" names both a Surface and an Action.`);
    }
  }
  return { actions, surfaces };
};
