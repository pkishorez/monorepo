import { type Binding, describe } from '../../core/binding/index.ts';
import { isTextEntry } from '../../core/key-input/index.ts';
import {
  development,
  type Dispatcher,
  type Vim,
} from '../../core/provider/index.ts';
import { bindingsOf, type Flat } from '../definition/index.ts';
import { conflictsOf, isEscape, type Live, resolve } from './actions.ts';
import { createDeclarations } from './declarations.ts';
import {
  firstElement,
  focusIn,
  focusLost,
  focusTarget,
  watchPage,
} from './focus.ts';
import {
  inside,
  isolationOf,
  levelsOf,
  nearestFocusable,
  pathOf,
  type State,
  stateOf,
} from './tree.ts';

export type { State } from './tree.ts';

export type Mode = 'normal' | 'insert';

/** What a component says an Action does: `useAction`'s Handler. */
export type Handler = {
  readonly current: { readonly run: () => void; readonly enabled: boolean };
};

/** An Action that works where the user is, for a help sheet. */
export type Available = {
  readonly id: string;
  readonly keys: ReadonlyArray<Binding>;
  readonly label: string;
  /** The name of its Surface. */
  readonly surface: string;
  readonly always: boolean;
  /** Whether a nearer Action has all its keys. */
  readonly shadowed: boolean;
  /** Runs it, as its keys would. */
  readonly run: () => void;
};

/** Where the user is, for a status bar. */
export type Status = {
  readonly active: string;
  /** The Surfaces from the outermost down to the Active one. */
  readonly path: ReadonlyArray<string>;
  /** The labels of `path`. */
  readonly names: ReadonlyArray<string>;
  readonly mode: Mode;
  /** The steps of the Sequence under way, as people write them. */
  readonly pending: string | null;
};

/** A named place in a Surface where focus can rest, such as its composer. */
type Spot = {
  readonly surface: string;
  readonly name: string;
  readonly default: boolean;
};

// A Surface remembering its own element, not one of its Focus Spots.
const ITSELF = Symbol('itself');

const warn = (message: string) => {
  if (development()) console.warn(`use-keys: ${message}`);
};

// Up from an element, through a shadow root to its host.
const up = (element: Element) => {
  if (element.parentElement !== null) return element.parentElement;
  const root = element.getRootNode();
  return root instanceof ShadowRoot ? root.host : null;
};

/**
 * One keys.Provider's keyboard: the Active Surface on the keys tree, the
 * Handlers components give the Actions, and the elements that draw each
 * Surface. After every change it tells the Keys Provider which keys work,
 * and its subscribers that it changed. Escape goes through it first.
 */
const NO_KEYS: ReadonlyArray<Binding> = [];

export const createStore = (flat: Flat, dispatcher: Dispatcher, vim: Vim) => {
  const tree = flat.surfaces;
  const defaults = new Map(
    [...flat.actions.values()].map((action) => [
      action.id,
      bindingsOf(action.keys),
    ]),
  );
  let custom = new Map<string, ReadonlyArray<Binding>>();
  let active = flat.initial;
  // An Isolated Surface: the Active Surface it was entered from.
  const from = new Map<string, string>();
  const handlers = new Map<string, Handler[]>();
  const elements = new Map<string, Set<HTMLElement>>();
  const owners = new WeakMap<Element, string>();
  const exits = new Map<string, Set<{ current: (() => void) | undefined }>>();
  // Each Surface's Focus Spots, and the spot or element focus was last in.
  const spots = new Map<string, Map<HTMLElement, Spot>>();
  const spotOf = new WeakMap<Element, Spot>();
  const memory = new Map<string, string | typeof ITSELF>();
  // The innermost Surface DOM focus is in, and whether that is Text Entry.
  let focused: string | null = null;
  let textEntry = false;
  // The Surface DOM focus last went into; kept when focus goes to nothing,
  // or to an element of no Surface.
  let lastIn: string | null = null;
  // The Surface come back to whose Focus Spot, or element, should take focus.
  let owed: string | null = null;
  // Whether focus follows the Active Surface at all; off, only the user moves it.
  let autoFocus = true;
  let attached = false;
  let lost = new Set<string>();
  let liveSaid = '';
  let version = 0;
  const listeners = new Set<() => void>();

  const notify = () => {
    version += 1;
    for (const listener of listeners) listener();
  };

  // Undefined without a Handler; null when every Handler is off.
  const handlerOf = (id: string) => {
    const list = handlers.get(id) ?? [];
    if (list.length === 0) return undefined;
    return list.findLast((handler) => handler.current.enabled) ?? null;
  };

  /** The Actions that do something, in the order written. */
  const liveActions = (): Live[] =>
    [...flat.actions.values()]
      .filter((action) => {
        const handler = handlerOf(action.id);
        return handler === undefined
          ? action.enters !== undefined
          : handler !== null;
      })
      .map((action) => ({
        action,
        bindings: custom.get(action.id) ?? defaults.get(action.id) ?? [],
      }));

  /** The live Actions that work with Vim Mode as it is. */
  const working = () => {
    const on = vim.on();
    return liveActions().filter(
      ({ action }) => !lost.has(action.id) && (on || action.always),
    );
  };

  // Finds the Conflicts again when what is live changes.
  const check = () => {
    const live = liveActions();
    const said = JSON.stringify(
      live.map(({ action, bindings }) => [action.id, bindings.map(describe)]),
    );
    if (said === liveSaid) return;
    liveSaid = said;
    const found = conflictsOf(live, dispatcher.mac);
    lost = found.lost;
    const [first] = found.messages;
    if (first === undefined) return;
    if (development()) throw new Error(first);
    for (const message of found.messages) console.warn(message);
  };

  const mode = (): Mode =>
    textEntry && inside(tree, focused, active) ? 'insert' : 'normal';

  const resolved = () =>
    resolve(levelsOf(tree, active), working(), dispatcher.mac);

  const changed = () => {
    if (attached) declarations.sync(resolved().working, mode() === 'insert');
    notify();
  };

  const liveChanged = () => {
    if (attached) check();
    changed();
  };

  const spotsOf = (name: string) =>
    [...(spots.get(name) ?? [])].filter(([element]) => element.isConnected);

  // Where focus goes back to in a Surface: the Focus Spot it was last in,
  // else its default one, else, in Vim Mode, its first element. A Surface
  // last focused on its own element goes back to it.
  const placeOf = (name: string) => {
    const first = () => firstElement(elements.get(name) ?? []);
    const remembered = memory.get(name);
    if (remembered === ITSELF) return first();
    const mine = spotsOf(name);
    const spot =
      mine.findLast(([, each]) => each.name === remembered) ??
      mine.findLast(([, each]) => each.default);
    if (spot !== undefined) return focusTarget(spot[0]);
    return vim.on() ? first() : undefined;
  };

  // Focus goes back to the Surface come back to, unless it is already in
  // it; a Focus Spot or element mounting later takes it.
  const settleFocus = () => {
    if (owed === null) return;
    if (owed !== active || !autoFocus) {
      owed = null;
      return;
    }
    const mine = [
      ...(elements.get(active) ?? []),
      ...spotsOf(active).map(([element]) => element),
    ];
    if (focusIn(mine)) {
      owed = null;
      return;
    }
    const place = placeOf(active);
    if (place === undefined) return;
    owed = null;
    place.focus({ preventScroll: true });
  };
  // `always`: a route back to a Surface, which restores focus with Vim Mode
  // off too; otherwise only with it on.
  // At once when the place is there, so focus is out of a Surface left
  // before it is drawn closed; else once React has committed.
  const moveFocus = (always: boolean) => {
    if (typeof document === 'undefined' || !autoFocus) return;
    if (!always && !vim.on()) return;
    owed = active;
    settleFocus();
    if (owed !== null) queueMicrotask(settleFocus);
  };
  // A Focus Spot or element of the Active Surface mounted: if focus was in
  // that Surface and fell to nothing, or out of every Surface, as when its
  // element was remounted, it goes back; with `autoFocus` off, it stays.
  const mounted = (name: string) => {
    if (!autoFocus) return;
    if (owed === name) {
      queueMicrotask(settleFocus);
      return;
    }
    if (!attached || name !== active || !inside(tree, lastIn, active)) return;
    // Lost, or resting outside every Surface, as on a closing popup.
    if (!focusLost() && ownerOf(document.activeElement) !== null) return;
    owed = active;
    queueMicrotask(settleFocus);
  };

  // Remembers the Focus Spot focus went into, or the Surface's own element.
  const remember = (target: Element) => {
    for (let at: Element | null = target; at !== null; at = up(at)) {
      const spot = spotOf.get(at);
      if (spot !== undefined) {
        memory.set(spot.surface, spot.name);
        return;
      }
      const owner = owners.get(at);
      if (owner === undefined) continue;
      if (at === target) memory.set(owner, ITSELF);
      return;
    }
  };

  const enter = (
    name: string,
    how: { readonly move: boolean; readonly guarded: boolean },
  ) => {
    const target = nearestFocusable(tree, name);
    if (target === null) {
      warn(`"${name}" is not focusable, and no Surface above it is.`);
      return;
    }
    const isolation = isolationOf(tree, active);
    if (how.guarded && isolation !== null && !inside(tree, target, isolation)) {
      return;
    }
    if (target !== active) {
      for (const at of pathOf(tree, target)) {
        if (tree.get(at)?.isolated === true && !inside(tree, active, at)) {
          from.set(at, active);
        }
      }
      active = target;
      changed();
    }
    if (how.move) moveFocus(true);
  };

  // Leaves the Active Surface, as Escape does: runs every onExit of it,
  // and goes outward, or back to where an Isolated one was entered from.
  const leave = () => {
    const surface = tree.get(active);
    if (surface === undefined) return false;
    const outward = nearestFocusable(tree, surface.parent);
    const target = surface.isolated
      ? (from.get(active) ?? outward ?? flat.initial)
      : outward;
    if (target === null || target === active) return false;
    const left = active;
    for (const exit of exits.get(left) ?? []) exit.current?.();
    from.delete(left);
    active = target;
    changed();
    moveFocus(true);
    return true;
  };

  const run = (id: string) => {
    const action = flat.actions.get(id);
    const handler = handlerOf(id);
    if (action === undefined || handler === null) return;
    handler?.current.run();
    if (action.enters !== undefined) {
      enter(action.enters, { move: true, guarded: false });
    }
  };

  const declarations = createDeclarations(dispatcher, run, notify);

  // The Escape order, after any element that used it.
  const escape = (element: Element | null, inText: boolean) => {
    const surface = tree.get(active);
    if (surface === undefined) return false;
    const on = vim.on();
    if (on && inText && !surface.isolated && mode() === 'insert') {
      const first = firstElement(elements.get(active) ?? []);
      if (first === undefined) (element as HTMLElement | null)?.blur();
      else first.focus({ preventScroll: true });
      return true;
    }
    const own = working().find(
      ({ action, bindings }) =>
        action.surface === active && bindings.some(isEscape),
    );
    if (own !== undefined) {
      run(own.action.id);
      return true;
    }
    return on || surface.isolated ? leave() : false;
  };

  // The innermost Surface an element is in: a Focus Spot is in its own.
  const ownerOf = (target: Element | null) => {
    for (let at = target; at !== null; at = up(at)) {
      const name = owners.get(at) ?? spotOf.get(at)?.surface;
      if (name !== undefined) return name;
    }
    return null;
  };

  // Snapshots, so each subscriber re-renders only when what it reads does.
  let statusView = { key: '', view: undefined as unknown as Status };
  let availableView = { version: -1, list: [] as ReadonlyArray<Available> };

  return {
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    /**
     * Whether focus follows the Active Surface on its own, into a Surface
     * entered and back to one returned to. Off, only the user moves it.
     */
    autoFocus: (on: boolean) => {
      autoFocus = on;
      // Off, focus owed to a Surface is forgotten: none moves on its own.
      if (!on) owed = null;
    },

    /** Starts hearing the page and Escape, and declaring keys. */
    attach: () => {
      attached = true;
      const stopPage =
        typeof document === 'undefined'
          ? () => {}
          : watchPage({
              pointed: (target) => {
                const name = ownerOf(target);
                if (name !== null) enter(name, { move: false, guarded: true });
              },
              focused: (target) => {
                textEntry = isTextEntry(target);
                focused = ownerOf(target);
                // Focus resting in no Surface, such as on a closing popup's
                // own element, is passing: it pays nothing owed, and the
                // Surface it was last in is kept.
                if (target !== null && focused !== null) {
                  owed = null;
                  lastIn = focused;
                }
                if (target !== null) remember(target);
                changed();
                if (focused !== null) {
                  enter(focused, { move: false, guarded: true });
                }
              },
            });
      const stopEscape = dispatcher.onEscape(escape);
      const stopVim = vim.subscribe(() => {
        changed();
        moveFocus(false);
      });
      liveChanged();
      moveFocus(false);
      return () => {
        attached = false;
        liveSaid = '';
        stopPage();
        stopEscape();
        stopVim();
        declarations.clear();
      };
    },

    /**
     * The user's own keys, by Action id: each replaces that Action's
     * defaults. Throws on keys that are no Shortcut or Sequence.
     */
    bind: (
      bindings: Readonly<
        Record<string, string | ReadonlyArray<string> | undefined>
      >,
    ) => {
      const next = new Map<string, ReadonlyArray<Binding>>();
      for (const [id, keys] of Object.entries(bindings)) {
        if (keys === undefined) continue;
        if (!flat.actions.has(id)) {
          warn(`bindings name "${id}", which is no Action.`);
          continue;
        }
        next.set(id, bindingsOf(keys));
      }
      custom = next;
      liveChanged();
    },

    /** Gives an Action a Handler; the latest Enabled one runs. */
    handle: (id: string, handler: Handler) => {
      handlers.set(id, [...(handlers.get(id) ?? []), handler]);
      liveChanged();
      return () => {
        handlers.set(
          id,
          (handlers.get(id) ?? []).filter((other) => other !== handler),
        );
        liveChanged();
      };
    },
    /** A Handler was turned on or off. */
    handlersChanged: liveChanged,

    /** Shows `element` as one of the elements that draw `name`. */
    element: (name: string, element: HTMLElement) => {
      const mine = elements.get(name) ?? new Set();
      elements.set(name, mine.add(element));
      owners.set(element, name);
      mounted(name);
      return () => {
        mine.delete(element);
        owners.delete(element);
      };
    },

    /**
     * Shows `element` as the Focus Spot `name` of `surface`, its default
     * one with `isDefault`.
     */
    spot: (
      surface: string,
      name: string,
      isDefault: boolean,
      element: HTMLElement,
    ) => {
      const mine = spots.get(surface) ?? new Map<HTMLElement, Spot>();
      const spot: Spot = { surface, name, default: isDefault };
      spots.set(surface, mine.set(element, spot));
      spotOf.set(element, spot);
      mounted(surface);
      return () => {
        mine.delete(element);
        spotOf.delete(element);
      };
    },

    /** Runs `exit` whenever the Surface is left. */
    onExit: (name: string, exit: { current: (() => void) | undefined }) => {
      const mine = exits.get(name) ?? new Set();
      exits.set(name, mine.add(exit));
      return () => {
        mine.delete(exit);
      };
    },

    /** Makes `name`, or the nearest Focusable Surface above it, Active. */
    enter: (name: string) => enter(name, { move: true, guarded: false }),
    /**
     * Leaves the Active Surface as Escape would; with `name`, only while
     * that one is Active.
     */
    leave: (name?: string) => {
      if (name === undefined || name === active) leave();
    },

    /** What one Surface shows, as a string that changes only with it. */
    view: (name: string) => {
      const state: State = vim.on() ? stateOf(tree, name, active) : 'off';
      return `${name === active} ${state} ${name === active ? mode() : 'normal'}`;
    },

    /** The Active Surface. */
    active: () => active,

    /** An Action's keys as bound now: the user's own, else its defaults. */
    keysOf: (id: string): ReadonlyArray<Binding> =>
      custom.get(id) ?? defaults.get(id) ?? NO_KEYS,

    status: (): Status => {
      const path = pathOf(tree, active);
      const view: Status = {
        active,
        path,
        names: path.map((name) => tree.get(name)?.label ?? name),
        mode: mode(),
        pending: declarations.pending(),
      };
      const key = JSON.stringify(view);
      if (key !== statusView.key) statusView = { key, view };
      return statusView.view;
    },

    /** Every Action that works now, nearest Surface first. */
    available: () => {
      if (availableView.version === version) return availableView.list;
      const list = resolved().shown.map(
        ({ live: { action, bindings }, shadowed }): Available => ({
          id: action.id,
          keys: bindings,
          label: action.label,
          surface: action.surface,
          always: action.always,
          shadowed,
          run: () => run(action.id),
        }),
      );
      availableView = { version, list };
      return list;
    },
  };
};

export type Store = ReturnType<typeof createStore>;
