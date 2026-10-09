import { memo, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import type { AnyNode, Handle, Snapshot } from '../core/index.ts';

type StateTag<N> = Snapshot<N>['state']['_tag'];

type InState<N, T> = Extract<
  Snapshot<N>,
  { readonly state: { readonly _tag: T } }
>;

/** A Node without States is drawn by one function; a Node with States by one function per State. */
type Draw<N> = [StateTag<N>] extends ['Single']
  ? (props: Snapshot<N>) => ReactNode
  : { readonly [T in StateTag<N>]: (props: InState<N, T>) => ReactNode };

/** A View: a React component drawing one Instance of its Node. */
export type ViewOf<N> = (props: { readonly node: Handle<N> }) => ReactNode;

/**
 * How one Node is drawn. The result re-renders only when its own Instance
 * changes, never because a parent View re-rendered: its only prop is the
 * Instance, which stays the same object for the Instance's whole life.
 */
const make = <N extends AnyNode>(node: N, draw: Draw<N>): ViewOf<N> => {
  const View = memo<{ readonly node: Handle<N> }>(({ node: instance }) => {
    const snapshot = useSyncExternalStore(instance.subscribe, instance.current);
    const drawState = (
      typeof draw === 'function' ? draw : draw[snapshot.state._tag as never]
    ) as (props: Snapshot<N>) => ReactNode;
    return drawState(snapshot);
  });
  View.displayName = `${node.name}View`;
  return View as ViewOf<N>;
};

export const View = { make };
