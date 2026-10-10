import { createContext, memo, use, useSyncExternalStore } from 'react';
import type { FunctionComponent, ReactNode } from 'react';
import { motionValue } from 'motion/react';
import type { MotionValue } from 'motion/react';
import type { AnyActor, Many, Only, Tagged, Types } from '../core/index.ts';

/** One Instance in the tree, to draw: only its ID, so it never changes. */
export interface Handle<A> {
  readonly id: string;
  readonly actor?: A;
}

type HandleOf<S> =
  S extends Many<infer A> ? ReadonlyArray<Handle<A>> : Handle<S>;

type KidsIn<A, T> = T extends keyof Types<A>['children']
  ? Types<A>['children'][T]
  : {};

/** What a View is handed for one Instance, narrowed by its current State. */
export type ViewProps<A> = {
  [T in Types<A>['state']['_tag']]: {
    readonly id: string;
    readonly model: Types<A>['model'];
    readonly state: Only<Types<A>['state'], T>;
    readonly children: {
      readonly [K in keyof KidsIn<A, T>]: HandleOf<KidsIn<A, T>[K]>;
    };
    readonly send: (message: Types<A>['message']) => void;
  };
}[Types<A>['state']['_tag']];

type StateTag<A> = ViewProps<A>['state']['_tag'];

type InState<A, T> = Extract<
  ViewProps<A>,
  { readonly state: { readonly _tag: T } }
>;

/**
 * What a draw function gets besides the Instance: the Frame, the Time the
 * app is drawn at. Turn it into motion with `useTransform`, or listen to it
 * with `useMotionValueEvent`; reading it never renders.
 */
type Drawing = { readonly frame: MotionValue<number> };

/**
 * The app's one Frame, provided by `toReact`. Outside a running app it
 * stands still at 0.
 */
export const FrameContext = createContext<MotionValue<number>>(motionValue(0));

/** What Views read the app through, provided by `toReact`. */
export interface Drawn {
  readonly subscribe: (listener: () => void) => () => void;
  /** The props of the Instance with this ID as drawn now, the same object while they do not change. */
  readonly props: (id: string) => ViewProps<AnyActor> | undefined;
}

export const DrawnContext = createContext<Drawn | undefined>(undefined);

/** An Actor without States is drawn by one function; an Actor with States by one function per State. */
type Draw<A> = [StateTag<A>] extends ['Single']
  ? (props: ViewProps<A> & Drawing) => ReactNode
  : {
      readonly [T in StateTag<A>]: (
        props: InState<A, T> & Drawing,
      ) => ReactNode;
    };

/** A View: a React component drawing one Instance of its Actor at the app's Frame. */
export type ViewOf<A> = (props: { readonly node: Handle<A> }) => ReactNode;

type Props = ViewProps<AnyActor> & Drawing;

/**
 * How one Actor is drawn. The result re-renders only when its own Instance's
 * Model, State or set of Children changes, never because a parent View or a
 * descendant did: its props are a Handle, which never changes.
 *
 * Each State is drawn by its own component, keyed by the State: a Transition
 * unmounts the old drawing and mounts the new one, so each State's draw can
 * keep its own hooks.
 */
const make = <A extends AnyActor>(actor: A, draw: Draw<A>): ViewOf<A> => {
  const drawOf = (tag: string, f: (props: Props) => ReactNode) => {
    const State: FunctionComponent<Props> = (props) => f(props);
    State.displayName = `${actor.name}.${tag}`;
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

  const View = memo<Parameters<ViewOf<A>>[0]>(({ node }) => {
    const frame = use(FrameContext);
    const drawn = use(DrawnContext);
    if (!drawn)
      throw new Error(
        `[effect-oak] ${actor.name}View is drawn outside its app`,
      );
    const props = useSyncExternalStore(drawn.subscribe, () =>
      drawn.props(node.id),
    );
    if (!props) return null;
    const tag = (props.state as Tagged)._tag;
    const State = states[tag]!;
    return <State key={tag} {...props} frame={frame} />;
  });
  View.displayName = `${actor.name}View`;
  return View as ViewOf<A>;
};

export const View = { make };
