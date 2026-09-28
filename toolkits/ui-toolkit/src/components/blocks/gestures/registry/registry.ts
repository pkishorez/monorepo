import type {
  Combination,
  Direction,
  GestureEvent,
  MovementEvent,
  Policy,
  Scroll,
  Side,
} from '../engine';
import {
  catchersOf,
  fallbackOn,
  holdUsedIn,
  moverFor,
  type Node,
  pinchesFor,
  tapsFor,
  targetsOf,
  wantsStrip,
} from './chain';
import { checkRegistration } from './checks';
import type { Registration } from './registration';

export { warnFallbackOff } from './checks';
export type { HoldOption, Registration } from './registration';

/** Where an edge Swipe starts, and whether it can start at all. */
export type EdgeState = 'edge' | 'zone' | 'off';

const removals = new WeakMap<Registration, Set<() => void>>();

/**
 * One Gesture Zone's registered hooks, linked to the zone around it. It
 * answers the engine's decisions from the whole chain, innermost zone first
 * (`policy`), sends each recognized gesture to the innermost zone with a hook
 * for it (`dispatch`, true when a hook took it), and refuses mistakes as
 * hooks register, in development.
 */
export const createRegistry = (options: {
  /** The registry of the zone around this one. */
  readonly parent: { readonly node: Node } | undefined;
  readonly scroll: () => Scroll;
  readonly appOwnsEdges: () => boolean;
}) => {
  const own = new Set<Registration>();
  const listeners = new Set<() => void>();
  const node: Node = {
    own,
    parent: options.parent?.node,
    appOwnsEdges: options.appOwnsEdges,
  };
  const notify = () => {
    for (const listener of listeners) listener();
  };

  const policy: Policy = {
    movement: (combination: Combination, direction: Direction, edge) =>
      moverFor(node, combination, direction, edge)?.kind,
    pinch: (hold) => pinchesFor(node, hold).length > 0,
  };

  const active = new Map<Registration, MovementEvent>();
  const caught = new Set<Registration>();
  const served = new Set<Registration>();
  const watching = new Map<Registration, () => void>();

  const unwatch = (registration: Registration) => {
    watching.get(registration)?.();
    watching.delete(registration);
  };
  const prune = () => {
    for (const registration of watching.keys()) {
      if (!active.has(registration) && !caught.has(registration))
        unwatch(registration);
    }
  };
  const cancelOne = (registration: Registration) => {
    const event = active.get(registration);
    active.delete(registration);
    if (event !== undefined && registration.gesture !== 'tap') {
      try {
        registration.handle({ ...event, phase: 'cancel' });
      } catch (error) {
        console.error('Gesture cancellation failed', error);
      }
    }
  };
  const watch = (registration: Registration) => {
    if (watching.has(registration)) return;
    const listeners = removals.get(registration);
    if (listeners === undefined) return;
    const remove = () => {
      caught.delete(registration);
      served.delete(registration);
      unwatch(registration);
      cancelOne(registration);
    };
    listeners.add(remove);
    watching.set(registration, () => listeners.delete(remove));
  };
  const cancel = () => {
    for (const registration of active.keys()) cancelOne(registration);
    const releasing = [...caught].filter(
      (registration) => !served.has(registration),
    );
    caught.clear();
    served.clear();
    prune();
    for (const registration of releasing) {
      if (removals.has(registration)) registration.release?.();
    }
  };

  const dispatch = (event: GestureEvent): boolean => {
    switch (event.kind) {
      case 'touch':
        if (event.phase === 'start') {
          served.clear();
          for (const registration of catchersOf(node)) {
            caught.add(registration);
            watch(registration);
            registration.catch?.();
          }
        } else {
          cancel();
        }
        return false;
      case 'hold':
        return event.phase === 'lock' && holdUsedIn(node, event.side);
      case 'tap': {
        const taps = tapsFor(node, event);
        for (const registration of taps) {
          if (!removals.has(registration)) continue;
          served.add(registration);
          if (registration.gesture === 'tap') registration.handle(event);
        }
        return taps.length > 0;
      }
      default: {
        if (event.phase === 'start') {
          for (const registration of targetsOf(node, event)) {
            active.set(registration, event);
            watch(registration);
          }
        }
        const took = active.size > 0;
        const terminal = event.phase === 'end' || event.phase === 'cancel';
        for (const registration of active.keys()) {
          if (terminal) active.delete(registration);
          else active.set(registration, event);
          served.add(registration);
          if (registration.gesture !== 'tap') registration.handle(event);
        }
        prune();
        return took;
      }
    }
  };

  return {
    node,
    policy,
    dispatch,
    cancel,
    /** Adds a hook; returns its removal. Throws in development on a mistake. */
    add: (registration: Registration): (() => void) => {
      checkRegistration(registration, { own, scroll: options.scroll() });
      own.add(registration);
      const listeners = new Set<() => void>();
      removals.set(registration, listeners);
      notify();
      return () => {
        if (!own.delete(registration)) return;
        removals.delete(registration);
        for (const listener of listeners) listener();
        notify();
      };
    },
    /** Whether a touch in edge strip `side` should be tracked. */
    wantsStrip: (side: Side) => wantsStrip(node, side),
    /** Where an edge Swipe starts in this Environment, or `off`. */
    edgeState: (registration: Registration): EdgeState => {
      if (registration.gesture !== 'swipe' || !registration.edge) return 'zone';
      if (node.appOwnsEdges()) return 'edge';
      return fallbackOn(node, registration) ? 'zone' : 'off';
    },
    /** Called when a hook comes or goes, or the Environment changes. */
    subscribe: (listener: () => void): (() => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /** Tells subscribers the answers may have changed with the Environment. */
    refresh: notify,
  };
};

export type Registry = ReturnType<typeof createRegistry>;
