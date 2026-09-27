import type {
  Combination,
  Direction,
  GestureEvent,
  Policy,
  Scroll,
  Side,
} from '../engine';
import {
  catchersOf,
  doubleTapIn,
  fallbackOn,
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

/**
 * One Gesture Zone's registered hooks, linked to the zone around it. It
 * answers the engine's decisions from the whole chain, innermost zone first
 * (`policy`), sends each recognized gesture to the innermost zone with a hook
 * for it (`dispatch`), and refuses mistakes as hooks register, in
 * development.
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
    doubleTap: (combination) => doubleTapIn(node, combination),
  };

  // The hooks the movement under way goes to, and the ones the touch caught.
  let active: ReadonlyArray<Registration> = [];
  const caught = new Set<Registration>();
  const served = new Set<Registration>();

  const dispatch = (event: GestureEvent): void => {
    switch (event.kind) {
      case 'touch':
        if (event.phase === 'start') {
          served.clear();
          for (const registration of catchersOf(node)) {
            caught.add(registration);
            registration.catch?.();
          }
        } else {
          for (const registration of caught) {
            if (!served.has(registration)) registration.release?.();
          }
          caught.clear();
        }
        return;
      case 'hold':
        return;
      case 'tap':
        for (const registration of tapsFor(node, event)) {
          served.add(registration);
          if (registration.gesture === 'tap') registration.handle(event);
        }
        return;
      default: {
        if (event.phase === 'start') active = targetsOf(node, event);
        for (const registration of active) {
          served.add(registration);
          if (registration.gesture !== 'tap') registration.handle(event);
        }
        if (event.phase === 'end' || event.phase === 'cancel') active = [];
      }
    }
  };

  return {
    node,
    policy,
    dispatch,
    /** Adds a hook; returns its removal. Throws in development on a mistake. */
    add: (registration: Registration): (() => void) => {
      checkRegistration(registration, { own, scroll: options.scroll() });
      own.add(registration);
      notify();
      return () => {
        own.delete(registration);
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
