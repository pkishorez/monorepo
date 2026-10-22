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
import { firstElement, focusIn, watchPage } from './focus.ts';
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
  // The innermost Surface DOM focus is in, and whether that is Text Entry.
  let focused: string | null = null;
  let textEntry = false;
  // The Surface entered by key whose element should take focus.
  let owed: string | null = null;
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

  // With Vim Mode on, focus follows a Surface entered by key to its first
  // element, unless it is already in one; an element mounting later takes it.
  const settleFocus = () => {
    if (owed === null) return;
    if (owed !== active || !vim.on()) {
      owed = null;
      return;
    }
    const mine = elements.get(active) ?? [];
    if (focusIn(mine)) {
      owed = null;
      return;
    }
    const first = firstElement(mine);
    if (first === undefined) return;
    owed = null;
    first.focus({ preventScroll: true });
  };
  const moveFocus = () => {
    if (!vim.on() || typeof document === 'undefined') return;
    owed = active;
    queueMicrotask(settleFocus);
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
    if (how.move) moveFocus();
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
    moveFocus();
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

  const ownerOf = (target: Element | null) => {
    for (let at = target; at !== null; at = up(at)) {
      const name = owners.get(at);
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
                changed();
                if (focused !== null) {
                  enter(focused, { move: false, guarded: true });
                }
              },
            });
      const stopEscape = dispatcher.onEscape(escape);
      const stopVim = vim.subscribe(() => {
        changed();
        moveFocus();
      });
      liveChanged();
      moveFocus();
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
      if (owed === name) queueMicrotask(settleFocus);
      return () => {
        mine.delete(element);
        owners.delete(element);
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
