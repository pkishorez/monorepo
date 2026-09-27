import {
  createGestureEngine,
  type GestureEngine,
  type GestureEvent,
  type Hold,
  type Scroll,
} from '../engine';
import { vibrate } from '#lib/haptics';
import { edgeStrips, type Environment } from '../../environment';
import { createRegistry, type Registry } from '../registry';
import { bindZone, measureZone } from '../zone';
import { createTree, type Tree } from './tree';

/** A value hooks subscribe to, re-rendering only when it changes. */
const createStore = <T>(initial: T) => {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set: (next: T) => {
      if (Object.is(value, next)) return;
      value = next;
      for (const listener of listeners) listener();
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
};

// Haptics: a light tick for a tap, a firmer one for a Hold locking.
const TAP_HAPTIC_MS = 10;
const HOLD_HAPTIC_MS = 20;

/**
 * What one Gesture Zone shares with the hooks and layers inside it: its
 * registry, linked to the zone around it; the Hold locked in it or in a zone
 * inside it; and the tree of every zone under the provider. The element,
 * engine and Environment are filled in as the zone mounts. `haptics` is read
 * from the provider's zone only.
 */
export type Hub = {
  readonly parent: Hub | undefined;
  readonly registry: Registry;
  readonly tree: Tree;
  readonly hold: ReturnType<typeof createStore<Hold | undefined>>;
  element: HTMLElement | null;
  environment: Environment;
  scroll: Scroll;
  haptics: boolean;
};

export const createHub = (options: {
  readonly parent: Hub | undefined;
  readonly scroll: Scroll;
  readonly environment: Environment;
}): Hub => {
  const hub: Hub = {
    parent: options.parent,
    registry: createRegistry({
      parent: options.parent?.registry,
      scroll: () => hub.scroll,
      appOwnsEdges: () => edgeStrips(hub.environment).left.owner === 'app',
    }),
    tree: options.parent?.tree ?? createTree(() => hub.environment),
    hold: createStore<Hold | undefined>(undefined),
    element: null,
    environment: options.environment,
    scroll: options.scroll,
    haptics: false,
  };
  return hub;
};

/** The zone's box right now, for hooks that measure from it as a gesture starts. */
export const boxOf = (hub: Hub) =>
  hub.element?.getBoundingClientRect() ?? {
    left: 0,
    top: 0,
    width: 0,
    height: 0,
  };

/** Sets the Hold on this zone and every zone around it, for `useHold` anywhere out. */
const setHold = (hub: Hub, hold: Hold | undefined) => {
  for (let at: Hub | undefined = hub; at !== undefined; at = at.parent) {
    at.hold.set(hold);
  }
};

/** Whether the provider around this zone turned haptics on. */
const hapticsOn = (hub: Hub): boolean =>
  hub.parent === undefined ? hub.haptics : hapticsOn(hub.parent);

/**
 * Runs a mounted zone: an engine reading its element's pointers, whose
 * gestures go to the registry chain, the Hold store and the layers' tree.
 * With haptics on, a tap a hook took and a Hold some hook answers vibrate.
 * Returns the teardown.
 */
export const runHub = (hub: Hub, element: HTMLElement): (() => void) => {
  let engine: GestureEngine | undefined;
  const member = {
    scroll: () => hub.scroll,
    inspect: () => engine?.inspect(),
    measure: () =>
      hub.element === null
        ? undefined
        : measureZone(hub.element, hub.environment),
    element: () => hub.element,
  };
  const onGesture = (event: GestureEvent) => {
    if (event.kind === 'hold') {
      setHold(
        hub,
        event.phase === 'lock'
          ? { side: event.side, point: event.point }
          : undefined,
      );
    }
    hub.tree.hear(member, event);
    const took = hub.registry.dispatch(event);
    if (!took || !hapticsOn(hub)) return;
    if (event.kind === 'tap') vibrate(TAP_HAPTIC_MS);
    else if (event.kind === 'hold') vibrate(HOLD_HAPTIC_MS);
  };
  engine = createGestureEngine({
    scroll: hub.scroll,
    policy: hub.registry.policy,
    onGesture,
  });
  const running = engine;
  const leave = hub.tree.add(member, hub.parent === undefined);
  const stopNotifying = running.subscribe(hub.tree.notify);
  const unbind = bindZone(element, running, {
    environment: () => hub.environment,
    scroll: hub.scroll,
    wantsStrip: hub.registry.wantsStrip,
  });
  return () => {
    unbind();
    stopNotifying();
    running.stop();
    leave();
    setHold(hub, undefined);
    engine = undefined;
  };
};
