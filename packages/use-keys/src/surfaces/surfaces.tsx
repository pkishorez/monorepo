import {
  cloneElement,
  createContext,
  type HTMLAttributes,
  isValidElement,
  type ReactNode,
  type Ref,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { Binding } from '../core/binding/index.ts';
import {
  development,
  KeysProvider,
  useDispatcher,
  useVimMode,
} from '../core/provider/index.ts';
import {
  type ActionId,
  type Checked,
  type Definition,
  flatten,
  type SurfaceName,
} from './definition/index.ts';
import { composeRefs, mergeProps } from './slot.ts';
import {
  createStore,
  type Mode,
  type State,
  type Store,
} from './store/index.ts';

export type {
  ActionDefinition,
  ActionId,
  Definition,
  SurfaceDefinition,
  SurfaceName,
} from './definition/index.ts';
export type { Mode, State } from './store/index.ts';

/** Class names for a Surface's element in each state; none while Off. */
export type Appearance = {
  readonly active?: string;
  readonly parent?: string;
  readonly inactive?: string;
};

/** How the keyboard feels. */
export type Timing = {
  /**
   * How a held key Repeats an Action that asks to: after `delay` ms, then
   * every `interval` ms. `{ delay: 200, interval: 40 }` by default.
   */
  readonly repeat?: { readonly delay?: number; readonly interval?: number };
  /** How long, in ms, a Sequence waits for its next step: 800 by default. */
  readonly sequence?: number;
};

/** One Surface as a component draws it. */
export type SurfaceView = {
  /** Whether it is the Active Surface, with Vim Mode on or off. */
  readonly active: boolean;
  /** How to draw it: `off` while Vim Mode is off. */
  readonly state: State;
  /** Insert while focus is in Text Entry inside it; Normal otherwise. */
  readonly mode: Mode;
};

/** Where the user is, and how to move them, for a status bar. */
export type Keyboard<D> = {
  readonly active: SurfaceName<D>;
  /** The Surfaces from the outermost down to the Active one. */
  readonly path: ReadonlyArray<SurfaceName<D>>;
  /** The labels of `path`. */
  readonly names: ReadonlyArray<string>;
  readonly mode: Mode;
  /** The steps of the Sequence under way, as people write them, or null. */
  readonly pending: string | null;
  /** Makes a Surface, or the nearest Focusable one above it, Active. */
  readonly enter: (name: SurfaceName<D>) => void;
  /**
   * Leaves the Active Surface as Escape would: its `onExit` runs. With a
   * name, only while that Surface is Active.
   */
  readonly leave: (name?: SurfaceName<D>) => void;
  readonly vim: {
    readonly on: boolean;
    /** Asks the app to turn Vim Mode on or off. */
    readonly set: (on: boolean) => void;
    readonly toggle: () => void;
  };
};

/** An Action that works where the user is, for a help sheet or a palette. */
export type AvailableAction<D> = {
  readonly id: ActionId<D>;
  readonly keys: ReadonlyArray<Binding>;
  readonly label: string;
  readonly surface: SurfaceName<D>;
  readonly always: boolean;
  /** Whether a nearer Action has all its keys. */
  readonly shadowed: boolean;
  /** Runs it, as its keys would. */
  readonly run: () => void;
};

export type ProviderProps<D> = {
  /**
   * Whether Vim Mode is on: a preference the app keeps, such as in
   * localStorage. Without it, the provider keeps it, off at first.
   */
  readonly vim?: boolean;
  /** Asked to turn Vim Mode on or off, as from the status bar. */
  readonly onVimChange?: (on: boolean) => void;
  readonly timing?: Timing;
  /** Class names for every Surface, each state on its own. */
  readonly appearance?: Appearance;
  /**
   * The user's own keys, by Action id. Each replaces that Action's
   * defaults, and a change works at once.
   */
  readonly bindings?: {
    readonly [Id in ActionId<D>]?: string | ReadonlyArray<string>;
  };
  readonly children?: ReactNode;
};

export type SurfaceProps<D> = Omit<
  HTMLAttributes<HTMLDivElement>,
  'children' | 'className' | 'id'
> & {
  readonly id: SurfaceName<D>;
  /** Draws it on its single child instead of a `div`. */
  readonly asChild?: boolean;
  /** Its own class names by state, over the provider's. */
  readonly appearance?: Appearance;
  readonly className?: string;
  /** Runs when Escape, or `leave`, leaves this Surface. */
  readonly onExit?: () => void;
  readonly ref?: Ref<HTMLElement>;
  readonly children?: ReactNode | ((surface: SurfaceView) => ReactNode);
};

/** An app's keyboard, made by `createKeys`, typed by its definition. */
export type Keys<D extends Definition> = {
  readonly definition: D;
  /**
   * Holds the Active Surface and Vim Mode, and makes the keys of the
   * Active Surface work. It holds a KeysProvider, so `useShortcut` and
   * `useSequence` work inside it too.
   */
  readonly Provider: (props: ProviderProps<Definition>) => ReactNode;
  /** An element that draws a Surface; any number may draw one. */
  readonly Surface: (props: SurfaceProps<Definition>) => ReactNode;
  /** Says what an Action does while the calling component is mounted. */
  readonly useAction: (
    id: ActionId<D>,
    run: () => void,
    options?: { readonly enabled?: boolean },
  ) => void;
  readonly useSurface: (name: SurfaceName<D>) => SurfaceView;
  readonly useActive: () => SurfaceName<D>;
  readonly useKeyboard: () => Keyboard<D>;
  readonly useAvailableActions: () => ReadonlyArray<AvailableAction<D>>;
};

const DEFAULT_REPEAT = { delay: 200, interval: 40 };
const DEFAULT_SEQUENCE = 800;
const NO_BINDINGS = {};

// Warned once each: an Active Surface drawn inside an Inactive one.
const warned = new Set<string>();

const useView = (store: Store, name: string): SurfaceView => {
  const read = () => store.view(name);
  const shown = useSyncExternalStore(store.subscribe, read, read);
  return useMemo(() => {
    const [active, state, mode] = shown.split(' ') as [string, State, Mode];
    return { active: active === 'true', state, mode };
  }, [shown]);
};

/**
 * An app's whole keyboard from one definition: its Surfaces, as they
 * nest, and the Actions on each. Gives the provider, the Surface
 * component and the hooks, typed by the definition's names. Throws on a
 * definition that cannot work, such as keys that are no Shortcut.
 */
export function createKeys<const D extends Definition>(
  definition: D & Checked<D>,
): Keys<D> {
  return make(definition) as unknown as Keys<D>;
}

// The keyboard, typed loosely: `createKeys` gives it the definition's names.
function make(definition: Definition): Keys<Definition> {
  const flat = flatten(definition);
  const StoreContext = createContext<Store | null>(null);
  const AppearanceContext = createContext<Appearance>({});

  const useStore = (user: string) => {
    const store = useContext(StoreContext);
    if (store === null) {
      throw new Error(`${user} must be used inside its keys.Provider`);
    }
    return store;
  };

  function Surfaces(props: {
    readonly appearance: Appearance | undefined;
    readonly bindings: object;
    readonly children: ReactNode;
  }) {
    const dispatcher = useDispatcher('keys.Provider');
    const vim = useVimMode('keys.Provider');
    const [store] = useState(() => createStore(flat, dispatcher, vim));
    const said = JSON.stringify(props.bindings);
    useLayoutEffect(() => store.bind(JSON.parse(said)), [store, said]);
    useLayoutEffect(() => store.attach(), [store]);
    const { active, parent, inactive } = props.appearance ?? {};
    const appearance = useMemo(
      (): Appearance => ({
        ...(active === undefined ? {} : { active }),
        ...(parent === undefined ? {} : { parent }),
        ...(inactive === undefined ? {} : { inactive }),
      }),
      [active, parent, inactive],
    );
    return (
      <StoreContext value={store}>
        <AppearanceContext value={appearance}>
          {props.children}
        </AppearanceContext>
      </StoreContext>
    );
  }

  function Provider(props: ProviderProps<Definition>) {
    const { timing } = props;
    return (
      <KeysProvider
        {...(props.vim === undefined ? {} : { vim: props.vim })}
        {...(props.onVimChange === undefined
          ? {}
          : { onVimChange: props.onVimChange })}
        repeat={{ ...DEFAULT_REPEAT, ...timing?.repeat }}
        sequence={{ timeout: timing?.sequence ?? DEFAULT_SEQUENCE }}
      >
        <Surfaces
          appearance={props.appearance}
          bindings={props.bindings ?? NO_BINDINGS}
        >
          {props.children}
        </Surfaces>
      </KeysProvider>
    );
  }

  function Surface(props: SurfaceProps<Definition>) {
    const {
      id,
      asChild,
      appearance,
      className,
      onExit,
      ref,
      children,
      ...rest
    } = props;
    if (!flat.surfaces.has(id)) {
      throw new Error(`use-keys: "${id}" is no Surface of this keys.`);
    }
    const store = useStore('keys.Surface');
    const shared = useContext(AppearanceContext);
    const view = useView(store, id);

    const exit = useRef(onExit);
    useLayoutEffect(() => {
      exit.current = onExit;
    });
    useLayoutEffect(() => store.onExit(id, exit), [store, id]);

    const drawn = useRef<HTMLElement | null>(null);
    const own = useCallback(
      (element: HTMLElement | null) => {
        drawn.current = element;
        return element === null ? undefined : store.element(id, element);
      },
      [store, id],
    );

    const { state } = view;
    useEffect(() => {
      if (state !== 'active' || !development()) return;
      const outer = drawn.current?.parentElement?.closest(
        '[data-surface][data-state="inactive"]',
      );
      const name = outer?.getAttribute('data-surface');
      if (name === null || name === undefined || warned.has(`${id} ${name}`))
        return;
      warned.add(`${id} ${name}`);
      console.warn(
        `use-keys: the Active Surface "${id}" is drawn inside "${name}", which is Inactive and dims it. Nest "${id}" under "${name}" in the keys tree.`,
      );
    }, [state, id]);

    const content = typeof children === 'function' ? children(view) : children;
    const child = asChild === true && isValidElement(content) ? content : null;
    const childProps = (child?.props ?? {}) as Record<string, unknown>;
    const childRef = childProps.ref as Ref<HTMLElement> | undefined;
    const merged = useMemo(
      () => composeRefs(own, ref, childRef),
      [own, ref, childRef],
    );

    const look =
      state === 'off' ? undefined : (appearance?.[state] ?? shared[state]);
    const data = {
      'data-surface': id,
      'data-state': state,
      'data-mode': view.active ? view.mode : undefined,
    };
    const attributes = {
      tabIndex: -1,
      ...rest,
      className: [className, look].filter(Boolean).join(' ') || undefined,
    };
    if (asChild === true) {
      if (child === null) {
        throw new Error(
          `use-keys: keys.Surface "${id}" with asChild draws on one element.`,
        );
      }
      return cloneElement(child, {
        ...mergeProps(attributes, childProps),
        ...data,
        ref: merged,
      } as Record<string, unknown>);
    }
    return (
      <div {...attributes} {...data} ref={merged}>
        {content}
      </div>
    );
  }

  const useAction: Keys<Definition>['useAction'] = (id, run, options = {}) => {
    const store = useStore('keys.useAction');
    const enabled = options.enabled !== false;
    const handler = useRef({ run, enabled });
    useLayoutEffect(() => {
      handler.current = { run, enabled };
    });
    useLayoutEffect(() => store.handle(id, handler), [store, id]);
    useLayoutEffect(() => store.handlersChanged(), [store, enabled]);
  };

  const useSurface: Keys<Definition>['useSurface'] = (name) =>
    useView(useStore('keys.useSurface'), name);

  const useActive: Keys<Definition>['useActive'] = () => {
    const store = useStore('keys.useActive');
    return useSyncExternalStore(store.subscribe, store.active, store.active);
  };

  const useKeyboard: Keys<Definition>['useKeyboard'] = () => {
    const store = useStore('keys.useKeyboard');
    const status = useSyncExternalStore(
      store.subscribe,
      store.status,
      store.status,
    );
    const vim = useVimMode('keys.useKeyboard');
    const on = useSyncExternalStore(vim.subscribe, vim.on, vim.on);
    return useMemo(
      () => ({
        ...status,
        enter: store.enter,
        leave: store.leave,
        vim: { on, set: vim.set, toggle: () => vim.set(!vim.on()) },
      }),
      [status, store, on, vim],
    );
  };

  const useAvailableActions: Keys<Definition>['useAvailableActions'] = () => {
    const store = useStore('keys.useAvailableActions');
    // Its ids and names are the definition's, which `createKeys` types.
    return useSyncExternalStore(
      store.subscribe,
      store.available,
      store.available,
    ) as ReadonlyArray<never>;
  };

  return {
    definition,
    Provider,
    Surface,
    useAction,
    useSurface,
    useActive,
    useKeyboard,
    useAvailableActions,
  };
}

/**
 * Scrolls `element` just into view, at once: for a cursor that moves
 * through a list from the keyboard. It never centers and never animates.
 */
export const revealInView = (element: Element | null | undefined) => {
  element?.scrollIntoView({
    block: 'nearest',
    inline: 'nearest',
    behavior: 'instant',
  });
};
