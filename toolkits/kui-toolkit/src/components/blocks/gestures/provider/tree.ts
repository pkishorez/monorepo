import type { GestureEvent, Inspection, Scroll } from '../engine';
import type { Environment } from '../../environment';
import { measureZone, nativeScrollers } from '../zone';

/** The last tap anywhere in the tree, for layers to answer; `count` tells a new one from the last. */
export type TapMark = {
  readonly x: number;
  readonly y: number;
  readonly count: number;
};

/** One zone as the layers see it. */
export type ZoneView = {
  readonly scroll: () => Scroll;
  readonly inspect: () => Inspection | undefined;
  readonly measure: () => ReturnType<typeof measureZone> | undefined;
};

/** What a layer reads from the zones under a provider. */
export type ZoneSource = {
  /** Called after every input and tick in any zone. */
  readonly subscribe: (listener: () => void) => () => void;
  readonly zones: () => ReadonlyArray<ZoneView>;
  /** The zone touched last: the machine the debug overlay follows. */
  readonly active: () => Inspection | undefined;
  readonly tap: () => TapMark | undefined;
  readonly scrollers: () => ReadonlyArray<Element>;
  readonly environment: () => Environment;
};

type Member = ZoneView & { readonly element: () => HTMLElement | null };

/**
 * Every zone under one provider, for the layers drawn over them all: the
 * zones come and go as they mount, and each one's events are heard here.
 */
export const createTree = (environment: () => Environment) => {
  const members = new Set<Member>();
  const listeners = new Set<() => void>();
  let active: Member | undefined;
  let tap: TapMark | undefined;
  let root: Member | undefined;

  const notify = () => {
    for (const listener of listeners) listener();
  };

  const source: ZoneSource = {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    zones: () => [...members],
    active: () => (active ?? root)?.inspect(),
    tap: () => tap,
    scrollers: () => {
      const element = root?.element();
      return element === null || element === undefined
        ? []
        : nativeScrollers(element);
    },
    environment,
  };

  return {
    source,
    notify,
    /** Adds a zone, the provider's own one as `outermost`. Returns its removal. */
    add: (member: Member, outermost: boolean): (() => void) => {
      if (outermost) root = member;
      members.add(member);
      notify();
      return () => {
        members.delete(member);
        if (active === member) active = undefined;
        if (root === member) root = undefined;
        notify();
      };
    },
    /** Hears one zone's gesture: who was touched last, and every tap. */
    hear: (member: Member, event: GestureEvent) => {
      if (event.kind === 'touch' && event.phase === 'start') active = member;
      if (event.kind === 'tap') {
        tap = {
          x: event.point.x,
          y: event.point.y,
          count: (tap?.count ?? 0) + 1,
        };
      }
    },
  };
};

export type Tree = ReturnType<typeof createTree>;
