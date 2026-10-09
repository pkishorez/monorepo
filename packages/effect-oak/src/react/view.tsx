import { memo, useSyncExternalStore } from 'react';
import type { FunctionComponent, ReactNode } from 'react';
import type { AnyNode, Handle, Snapshot } from '../core/index.ts';
import { useFrame } from './frames.ts';
import type { UseFrame } from './frames.ts';

type StateTag<N> = Snapshot<N>['state']['_tag'];

type InState<N, T> = Extract<
  Snapshot<N>,
  { readonly state: { readonly _tag: T } }
>;

/** What a draw function gets besides the Instance: a way to move things at every Frame. */
type Drawing = { readonly useFrame: UseFrame };

/** A Node without States is drawn by one function; a Node with States by one function per State. */
type Draw<N> = [StateTag<N>] extends ['Single']
  ? (props: Snapshot<N> & Drawing) => ReactNode
  : {
      readonly [T in StateTag<N>]: (
        props: InState<N, T> & Drawing,
      ) => ReactNode;
    };

/** A View: a React component drawing one Instance of its Node. */
export type ViewOf<N> = (props: { readonly node: Handle<N> }) => ReactNode;

type Props = Snapshot<AnyNode> & Drawing;

/**
 * How one Node is drawn. The result re-renders only when its own Instance
 * changes, never because a parent View re-rendered: its only prop is the
 * Instance, which stays the same object for the Instance's whole life.
 *
 * Each State is drawn by its own component, keyed by the State: a Transition
 * unmounts the old drawing and mounts the new one, so each State's draw can
 * keep its own hooks.
 */
const make = <N extends AnyNode>(node: N, draw: Draw<N>): ViewOf<N> => {
  const drawOf = (tag: string, f: (props: Props) => ReactNode) => {
    const State: FunctionComponent<Props> = (props) => f(props);
    State.displayName = `${node.name}.${tag}`;
    return State;
  };
  const states: Readonly<Record<string, FunctionComponent<Props>>> =
    typeof draw === 'function'
      ? { Single: drawOf('Single', draw as never) }
      : Object.fromEntries(
          Object.entries(draw).map(([tag, f]) => [
            tag,
            drawOf(tag, f as never),
          ]),
        );

  const View = memo<{ readonly node: Handle<N> }>(({ node: instance }) => {
    const snapshot = useSyncExternalStore(
      instance.subscribe,
      instance.current,
    ) as Snapshot<AnyNode>;
    const tag = snapshot.state._tag;
    const State = states[tag]!;
    return <State key={tag} {...snapshot} useFrame={useFrame} />;
  });
  View.displayName = `${node.name}View`;
  return View as ViewOf<N>;
};

export const View = { make };
