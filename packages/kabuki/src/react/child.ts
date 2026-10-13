import { use, useRef, useSyncExternalStore } from 'react';
import { AppContext } from './view.tsx';
import type { Drawable, DrawnApp, Handle, ViewProps } from './view.tsx';

/**
 * What a parent View can read of one Child: what the Child's own View draws
 * from, but not its Children and nothing to Send with. Reading never changes
 * the app, and it reaches one level down only.
 */
export type ChildData<A> =
  ViewProps<A> extends infer P
    ? P extends unknown
      ? Omit<P, 'children' | 'send' | 'root'>
      : never
    : never;

type Read = Omit<Drawable, 'children' | 'send'>;

// One read-only copy per drawn Instance, so it stays the same object while
// the Instance does.
const reads = new WeakMap<Drawable, Read>();

const readOf = (drawn: Drawable | undefined): Read | undefined => {
  if (!drawn) return undefined;
  let read = reads.get(drawn);
  if (!read) {
    const { _tag, id, model, state, props } = drawn;
    reads.set(drawn, (read = { _tag, id, model, state, props } as Read));
  }
  return read;
};

const useDrawn = (hook: string): DrawnApp => {
  const drawn = use(AppContext);
  if (!drawn)
    throw new Error(`[@kestack/kabuki] ${hook} is used outside its app`);
  return drawn;
};

/**
 * What a selector picked from each Child, kept per Child read, so a Child
 * that did not change is not picked from again. A new selector, as an inline
 * one is on every render, starts over.
 */
const usePicked = (select: ((child: never) => unknown) | undefined) => {
  const memo = useRef<{
    select: typeof select;
    picked: WeakMap<Read, unknown>;
  }>(undefined);
  if (!memo.current || memo.current.select !== select)
    memo.current = { select, picked: new WeakMap() };
  const { picked } = memo.current;
  return (read: Read): unknown => {
    if (!select) return read;
    if (!picked.has(read)) picked.set(read, select(read as never));
    return picked.get(read);
  };
};

interface UseChild {
  <A>(handle: Handle<A>): ChildData<A> | undefined;
  <A, S>(handle: Handle<A>, select: (child: ChildData<A>) => S): S | undefined;
}

/**
 * Reads one fixed Child from its parent's View: its Model, State and Props,
 * at the Step drawn; `undefined` once the Child has stopped. The component
 * re-renders when they change, or, given a selector, only when what it picks
 * changes. An escape hatch for drawing only: what a parent must act on, it
 * owns.
 */
export const useChild: UseChild = (
  handle: Handle<unknown>,
  select?: (child: never) => unknown,
) => {
  const drawn = useDrawn('useChild');
  const pick = usePicked(select);
  const last = useRef<unknown>(undefined);
  const from = (read: (id: string) => Drawable | undefined) => () => {
    const child = readOf(read(handle.id));
    const next = child && pick(child);
    return Object.is(next, last.current) ? last.current : (last.current = next);
  };
  return useSyncExternalStore(
    drawn.subscribe,
    from(drawn.instance),
    from(drawn.served),
  ) as never;
};

interface UseChildren {
  <A>(handles: ReadonlyArray<Handle<A>>): ReadonlyArray<ChildData<A>>;
  <A, S>(
    handles: ReadonlyArray<Handle<A>>,
    select: (child: ChildData<A>) => S,
  ): ReadonlyArray<S>;
}

/**
 * Reads a slot of keyed Children from their parent's View, in the slot's
 * order, leaving out any that stopped. The component re-renders when one of
 * them changes or the list does, or, given a selector, only when what it
 * picks from one of them changes or the list does.
 */
export const useChildren: UseChildren = (
  handles: ReadonlyArray<Handle<unknown>>,
  select?: (child: never) => unknown,
) => {
  const drawn = useDrawn('useChildren');
  const pick = usePicked(select);
  const last = useRef<ReadonlyArray<unknown>>([]);
  const from = (read: (id: string) => Drawable | undefined) => () => {
    const next = handles.flatMap((handle) => {
      const child = readOf(read(handle.id));
      return child ? [pick(child)] : [];
    });
    const was = last.current;
    if (
      next.length === was.length &&
      next.every((value, index) => Object.is(value, was[index]))
    )
      return was;
    return (last.current = next);
  };
  return useSyncExternalStore(
    drawn.subscribe,
    from(drawn.instance),
    from(drawn.served),
  ) as never;
};
