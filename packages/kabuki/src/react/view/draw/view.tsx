import { createContext, memo, use, useRef, useSyncExternalStore } from 'react';
import type { CSSProperties, ReactNode, Ref } from 'react';
import type {
  ActorOf,
  AnyActor,
  ChildAs,
  KidsIn,
  Only,
  Types,
} from '../../../core/actor/index.ts';

/** One Instance in the tree, to draw: its ID and, for a keyed Child, its key. Never changes. */
export interface Handle<A> {
  readonly id: string;
  readonly key?: string;
  readonly actor?: A;
}

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
    /** What its parent hands it now. */
    readonly props: Types<A>['props'];
    readonly children: {
      readonly [K in keyof KidsIn<A, T>]: ChildAs<
        KidsIn<A, T>[K],
        Handle<ActorOf<KidsIn<A, T>[K]>>
      >;
    };
    readonly send: (message: Types<A>['message']) => void;
    /** Spread on the element the View draws as its root: `<li {...root}>`. */
    readonly root: Root;
  };
}[Types<A>['state']['_tag']];

/** The Instance's part of what a View draws from; `root` is added when drawing. */
export type Drawable = Omit<ViewProps<AnyActor>, 'root'>;

/** What Views read the app through, provided by `View.app`. */
export interface DrawnApp {
  readonly subscribe: (listener: () => void) => () => void;
  /** The Instance with this ID in the Snapshot drawn now, the same object while it does not change. */
  readonly instance: (id: string) => Drawable | undefined;
  /** The Instance as first drawn, before any Runtime: what a server draws and the client hydrates against. */
  readonly served: (id: string) => Drawable | undefined;
  /** Whether it draws the app as it is now, not a past Step: what may touch the page around it. */
  readonly live: () => boolean;
}

export const AppContext = createContext<DrawnApp | undefined>(undefined);

/**
 * A View: a React component drawing one Instance of its Actor. A parent View hands it only where to draw: the Instance, and the
 * `ref` and `style` to animate it by. Data from the parent is its Props, which
 * the parent Actor hands it, so Update and Workers see it too.
 */
export type ViewOf<A> = ((props: {
  readonly instance: Handle<A>;
  readonly ref?: Ref<Element> | undefined;
  readonly style?: CSSProperties | undefined;
}) => ReactNode) & {
  /** The Actor it draws. */
  readonly actor: A;
  /**
   * The Input its app starts from, as the root of `View.app`, unless the
   * app is given its own: a routed root starts at the browser's URL.
   */
  readonly input?: () => unknown;
};

/**
 * How one Actor is drawn: one function of its Instance. The result re-renders
 * only when its own Instance's Model, State, Props or set of Children changes,
 * or the parent hands it a new `ref` or `style`, never because a descendant
 * did. A new Instance in the same place, as a Child with a new key, is drawn
 * afresh: no React state carries over from the one before.
 *
 * Once the Instance stops, the View keeps drawing its last data, so an exit
 * animation still has something to show.
 *
 * `style` counts as changed only when its values do: `motion.create` hands
 * the View a new `style` object on every render, with the same values.
 */
export const make = <A extends AnyActor>(
  actor: A,
  draw: (self: ViewProps<A>) => ReactNode,
): ViewOf<A> => {
  type Given = Parameters<ViewOf<A>>[0];
  const Drawn = ({ instance, ref, style }: Given) => {
    const drawn = use(AppContext);
    if (!drawn)
      throw new Error(
        `[@kestack/kabuki] ${actor.name}View is drawn outside its app`,
      );
    const live = useSyncExternalStore(
      drawn.subscribe,
      () => drawn.instance(instance.id),
      () => drawn.served(instance.id),
    );
    // The last data drawn, for a View still on screen after its Instance
    // stopped. Written during render on purpose: it only ever holds what
    // the store gave, so a render React throws away cannot leave it wrong.
    const last = useRef(live);
    if (live) last.current = live;
    const self = live ?? last.current;
    if (!self) return null;
    return draw({
      ...self,
      root: { ref: ref as Ref<never>, style },
    } as ViewProps<A>);
  };
  const View = memo(
    (given: Given & { readonly key?: never }) => (
      <Drawn key={given.instance.id} {...given} />
    ),
    same,
  );
  // Read when shown, so a name given after the View is made still counts.
  Object.defineProperties(View, {
    actor: { value: actor, enumerable: true },
    displayName: { get: () => `${actor.name}View`, configurable: true },
  });
  return View as unknown as ViewOf<A>;
};

type Shown = Readonly<Record<string, unknown>>;

/** What the parent hands is the same when each is the same value, and `style` when each of its values is. */
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
