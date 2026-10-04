import type { Binding } from '../../core/binding/index.ts';
import { type ActionNode, type Definition, flatten } from './definition.ts';
import { placeLevel } from './shadowing.ts';

export type {
  ActionDefinition,
  Definition,
  SurfaceDefinition,
} from './definition.ts';
export type { ActionId, Bindings, SurfaceId } from './ids.ts';

/**
 * Where an Action stands for the Active Surface:
 * - `active`: some of its keys work;
 * - `shadowed`: it has a Handler, but nearer Actions took all its keys;
 * - `unhandled`: its Surface works, but it has no Handler;
 * - `inactive`: its Surface does not work: neither Active nor around it,
 *   or cut off by an Isolated Surface or one that turns Globals off.
 */
export type ActionState = 'active' | 'shadowed' | 'unhandled' | 'inactive';

/** One Action for the Active Surface. */
export type Resolved = {
  readonly id: string;
  readonly description: string;
  readonly repeat: boolean;
  readonly inTextEntry: boolean;
  /** Its Bindings, the user's own in place of the defaults. */
  readonly bindings: ReadonlyArray<{
    readonly binding: Binding;
    readonly works: boolean;
  }>;
  readonly state: ActionState;
};

export type Resolution = {
  readonly actions: ReadonlyArray<Resolved>;
  /** Bindings that lost a Conflict to the user's own, and to which Action. */
  readonly lost: ReadonlyArray<{
    readonly id: string;
    readonly binding: Binding;
    readonly to: string;
  }>;
  /** Ids in the user's Bindings that name no Action. */
  readonly unknown: ReadonlyArray<string>;
};

/**
 * The central definition of an app's keyboard: its Surfaces and Actions.
 * For an Active Surface, the user's own Bindings and the Actions that
 * have a Handler, it says which keys work and where every Action stands.
 */
export const createSurfaceTree = (definition: Definition) => {
  const { actions, surfaces } = flatten(definition);

  // The Active Surface, each Surface around it up to the first Isolated
  // one, then the Global Actions unless one of those turns them off.
  const levelsAround = (surface: string | null) => {
    const levels: Array<string | null> = [];
    let globals = true;
    const parts = surface === null ? [] : surface.split('.');
    for (let end = parts.length; end > 0; end -= 1) {
      const id = parts.slice(0, end).join('.');
      const options = surfaces.get(id);
      levels.push(id);
      if (options?.globals === false) globals = false;
      if (options?.isolated === true) break;
    }
    if (globals) levels.push(null);
    return levels;
  };

  const resolve = (options: {
    readonly surface: string | null;
    readonly bindings: Readonly<Record<string, ReadonlyArray<Binding>>>;
    readonly handled: (id: string) => boolean;
    readonly mac: boolean;
  }): Resolution => {
    const levels = levelsAround(options.surface);
    const bindingsOf = (action: ActionNode) =>
      options.bindings[action.id] ?? action.definition.keys;
    const claimed: Binding[] = [];
    const placed = new Map(
      levels.flatMap((level) => [
        ...placeLevel(
          actions
            .filter((action) => action.surface === level)
            .filter((action) => options.handled(action.id))
            .map((action) => ({
              action,
              bindings: bindingsOf(action),
              own: action.id in options.bindings,
            })),
          claimed,
          options.mac,
        ),
      ]),
    );
    const state = (action: ActionNode): ActionState => {
      if (!levels.includes(action.surface)) return 'inactive';
      const works = placed.get(action.id)?.works;
      if (works === undefined) return 'unhandled';
      return works.some(Boolean) ? 'active' : 'shadowed';
    };
    return {
      actions: actions.map((action) => {
        const works = placed.get(action.id)?.works ?? [];
        return {
          id: action.id,
          description: action.definition.description,
          repeat: action.definition.repeat === true,
          inTextEntry: action.definition.inTextEntry === true,
          bindings: bindingsOf(action).map((binding, i) => ({
            binding,
            works: works[i] === true,
          })),
          state: state(action),
        };
      }),
      lost: [...placed].flatMap(([id, { lost }]) =>
        lost.map((loss) => ({ id, ...loss })),
      ),
      unknown: Object.keys(options.bindings).filter(
        (id) => !actions.some((action) => action.id === id),
      ),
    };
  };

  return { resolve };
};

export type SurfaceTree = ReturnType<typeof createSurfaceTree>;
