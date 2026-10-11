import { createContext, memo, use, useRef, useSyncExternalStore } from 'react';
import type { CSSProperties, ReactNode, Ref } from 'react';
import { motionValue } from 'motion/react';
import type { MotionValue } from 'motion/react';
import type { AnyActor, Many, Only, Types } from '../core/index.ts';

/** One Instance in the tree, to draw: its ID and, for a keyed Child, its key. Never changes. */
export interface Handle<A> {
  readonly id: string;
  readonly key?: string;
  readonly actor?: A;
}

type HandleOf<S> =
  S extends Many<infer A>
    ? ReadonlyArray<Handle<A> & { readonly key: string }>
    : Handle<S>;

type KidsIn<A, T> = T extends keyof Types<A>['children']
  ? Types<A>['children'][T]
  : {};

/**
 * What a parent may hand the root element of a View: the `ref` and `style`
 * Framer Motion animates through. Typed so it spreads on any element.
 */
export interface Root {
  readonly ref: Ref<never> | undefined;
  readonly style: CSSProperties | undefined;
}

/**
 * What a View draws one Instance from, narrowed by its current State: `_tag`
 * repeats the State's tag at the top so a `switch` on it narrows `state` and
 * `children` together.
 */
export type ViewProps<A> = {
  [T in Types<A>['state']['_tag']]: {
    readonly _tag: T;
    readonly id: string;
    readonly model: Types<A>['model'];
    readonly state: Only<Types<A>['state'], T>;
    readonly children: {
      readonly [K in keyof KidsIn<A, T>]: HandleOf<KidsIn<A, T>[K]>;
    };
    readonly send: (message: Types<A>['message']) => void;
    /**
     * The Time the app is drawn at. Turn it into motion with `useTransform`,
     * or listen to it with `useMotionValueEvent`; reading it never renders.
     */
    readonly frame: MotionValue<number>;
    /** Spread on the element the View draws as its root: `<li {...root}>`. */
    readonly root: Root;
  };
}[Types<A>['state']['_tag']];

/**
 * The app's one Frame, provided by `toReact`. Outside a running app it
 * stands still at 0.
 */
export const FrameContext = createContext<MotionValue<number>>(motionValue(0));

/** The Instance's part of what a View draws from; the Frame and root are added when drawing. */
export type Drawable = Omit<ViewProps<AnyActor>, 'frame' | 'root'>;

/** What Views read the app through, provided by `toReact`. */
export interface Drawn {
  readonly subscribe: (listener: () => void) => () => void;
  /** The Instance with this ID as drawn now, the same object while it does not change. */
  readonly props: (id: string) => Drawable | undefined;
  /** The Instance as first drawn, before any Runtime: what a server draws and the client hydrates against. */
  readonly served: (id: string) => Drawable | undefined;
}

export const DrawnContext = createContext<Drawn | undefined>(undefined);

/** Names a View's component takes for itself, which its own props cannot use. */
type Reserved = 'instance' | 'key' | 'ref' | 'style';

/**
 * The props a parent may not hand a View: functions and reserved names. Props
 * are data only, so what a View does always goes through a Message.
 */
type NotData<P> = {
  [K in keyof P]: K extends Reserved ? K : P[K] extends Function ? K : never;
}[keyof P];

type Checked<P> = [NotData<P>] extends [never]
  ? []
  : [notData: { readonly propsMustBeData: NotData<P> }];

/** A View: a React component drawing one Instance of its Actor at the app's Frame. */
export type ViewOf<A, P = {}> = (
  props: {
    readonly instance: Handle<A>;
    readonly ref?: Ref<Element> | undefined;
    readonly style?: CSSProperties | undefined;
  } & P,
) => ReactNode;

/**
 * How one Actor is drawn: one function from the Instance and the props its
 * parent hands it. The result re-renders only when its own Instance's Model,
 * State or set of Children changes, or its props do, never because a
 * descendant did.
 *
 * Once the Instance stops, the View keeps drawing its last data, so an exit
 * animation still has something to show.
 *
 * `style` counts as changed only when its values do: `motion.create` hands
 * the View a new `style` object on every render, with the same values.
 */
const make = <A extends AnyActor, P extends object = {}>(
  actor: A,
  draw: (self: ViewProps<A>, props: P) => ReactNode,
  ..._notData: Checked<P>
): ViewOf<A, P> => {
  const View = memo(
    ({
      instance,
      ref,
      style,
      ...props
    }: Parameters<ViewOf<A, P>>[0] & { readonly key?: never }) => {
      const frame = use(FrameContext);
      const drawn = use(DrawnContext);
      if (!drawn)
        throw new Error(
          `[effect-oak] ${actor.name}View is drawn outside its app`,
        );
      const live = useSyncExternalStore(
        drawn.subscribe,
        () => drawn.props(instance.id),
        () => drawn.served(instance.id),
      );
      // The last data drawn, for a View still on screen after its Instance
      // stopped. Written during render on purpose: it only ever holds what
      // the store gave, so a render React throws away cannot leave it wrong.
      const last = useRef(live);
      if (live) last.current = live;
      const self = live ?? last.current;
      if (!self) return null;
      return draw(
        {
          ...self,
          frame,
          root: { ref: ref as Ref<never>, style },
        } as ViewProps<A>,
        props as unknown as P,
      );
    },
    same,
  );
  View.displayName = `${actor.name}View`;
  return View as unknown as ViewOf<A, P>;
};

type Shown = Readonly<Record<string, unknown>>;

/** Props are the same when each is the same value, and `style` when each of its values is. */
const same = (a: Shown, b: Shown): boolean => {
  const keys = Object.keys(b);
  if (keys.length !== Object.keys(a).length) return false;
  return keys.every(
    (key) =>
      Object.is(a[key], b[key]) ||
      (key === 'style' && sameValues(a[key] as Shown, b[key] as Shown)),
  );
};

const sameValues = (a: Shown | undefined, b: Shown | undefined) =>
  a !== undefined && b !== undefined && same(a, b);

export const View = { make };
