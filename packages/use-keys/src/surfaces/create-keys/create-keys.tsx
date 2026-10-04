import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { type Binding, describe } from '../../core/binding/index.ts';
import {
  development,
  KeysProvider,
  useDeclare,
  useMac,
} from '../../core/provider/index.ts';
import {
  type ActionId,
  type Bindings,
  createSurfaceTree,
  type Definition,
  type Resolution,
  type Resolved,
  type SurfaceId,
} from '../surface-tree/index.ts';
import { createHandlers, type Handlers } from './handlers.ts';
import { type Status, statusOf } from './status.ts';

export type { Status } from './status.ts';

type Keyboard = {
  readonly surface: string | null;
  readonly setSurface: (surface: string | null) => void;
  readonly resolution: Resolution;
  readonly handlers: Handlers;
};

type ProviderProps<D extends Definition> = {
  /** The Active Surface, which the app keeps; null when there is none. */
  readonly surface: SurfaceId<D> | null;
  /** Asked to change the Active Surface, by `setSurface` from `useSurface`. */
  readonly onSurfaceChange?: (surface: SurfaceId<D> | null) => void;
  /**
   * The user's own Bindings, by Action id. Each replaces all of that
   * Action's defaults; a change works at once.
   */
  readonly bindings?: Bindings<D>;
  /** Whether any key works: true by default. */
  readonly enabled?: boolean;
  /** How a held key Repeats an Action that asks to. */
  readonly repeat?: { readonly delay?: number; readonly interval?: number };
  /** How long, in ms, a Sequence waits for its next step. */
  readonly sequence?: { readonly timeout?: number };
  readonly children?: ReactNode;
};

const NONE = {};

const warn = (message: string) => {
  if (development()) console.warn(`use-keys: ${message}`);
};

/**
 * An app's whole keyboard from one central definition: its Global
 * Actions, and its Surfaces, each with its Actions and the Surfaces inside
 * it. Gives the Provider and the hooks, typed by the definition's ids.
 */
export const createKeys = <const D extends Definition>(definition: D) => {
  const tree = createSurfaceTree(definition);
  const Context = createContext<Keyboard | undefined>(undefined);

  const useKeyboard = (user: string) => {
    const keyboard = useContext(Context);
    if (keyboard === undefined) {
      throw new Error(`${user} must be used inside its keys.Provider`);
    }
    return keyboard;
  };

  /**
   * Makes the keys of the Active Surface work. It holds a KeysProvider, so
   * `useShortcut` and `useSequence` work inside it too.
   */
  function Provider(props: ProviderProps<D>) {
    const { surface, onSurfaceChange, bindings, children, ...keys } = props;
    return (
      <KeysProvider {...keys}>
        <Surfaces
          surface={surface}
          onSurfaceChange={onSurfaceChange}
          bindings={bindings ?? NONE}
        >
          {children}
        </Surfaces>
      </KeysProvider>
    );
  }

  function Surfaces(props: {
    readonly surface: string | null;
    readonly onSurfaceChange: ((surface: never) => void) | undefined;
    readonly bindings: Readonly<Record<string, ReadonlyArray<Binding>>>;
    readonly children: ReactNode;
  }) {
    const mac = useMac('keys.Provider');
    const [handlers] = useState(createHandlers);
    const version = useSyncExternalStore(
      handlers.subscribe,
      handlers.version,
      handlers.version,
    );
    const { surface, bindings, onSurfaceChange } = props;
    const resolution = useMemo(
      () =>
        tree.resolve({
          surface,
          bindings,
          mac,
          handled: (id) => handlers.handler(id) !== undefined,
        }),
      [surface, bindings, mac, handlers, version],
    );

    useEffect(() => {
      for (const id of resolution.unknown) {
        warn(`the user's Bindings name "${id}", which is no Action.`);
      }
      for (const { id, binding, to } of resolution.lost) {
        warn(
          `"${describe(binding)}" of "${id}" does not work: "${to}" has it.`,
        );
      }
    }, [resolution]);

    const latest = useRef(onSurfaceChange);
    useLayoutEffect(() => {
      latest.current = onSurfaceChange;
    });
    const keyboard = useMemo<Keyboard>(
      () => ({
        surface,
        resolution,
        handlers,
        setSurface: (next) => {
          if (latest.current === undefined) {
            warn('setSurface needs onSurfaceChange on keys.Provider.');
          }
          latest.current?.(next as never);
        },
      }),
      [surface, resolution, handlers],
    );

    return (
      <Context value={keyboard}>
        {props.children}
        {resolution.actions
          .filter((action) => action.state === 'active')
          .map((action) => (
            <ActionKeys key={action.id} action={action} handlers={handlers} />
          ))}
      </Context>
    );
  }

  /** Declares the keys of one Action that work, and runs its Handler. */
  function ActionKeys(props: {
    readonly action: Resolved;
    readonly handlers: Handlers;
  }) {
    const { action, handlers } = props;
    const { id } = action;
    useEffect(() => () => handlers.progress(id, undefined), [handlers, id]);
    const working = action.bindings
      .filter(({ works }) => works)
      .map(({ binding }) => binding);
    useDeclare('keys.Provider', working, {
      enabled: true,
      inTextEntry: action.inTextEntry,
      repeat: handlers.handler(id)?.repeat ?? action.repeat,
      onCommit: () => {
        handlers.progress(id, undefined);
        handlers.handler(id)?.run.current();
      },
      onPossible: (progress) => handlers.progress(id, progress),
      onCancel: () => handlers.progress(id, undefined),
    });
    return null;
  }

  return {
    Provider,

    /** The Active Surface, and a way to ask the app to change it. */
    useSurface: () => {
      const { surface, setSurface } = useKeyboard('useSurface');
      return [
        surface as SurfaceId<D> | null,
        setSurface as (surface: SurfaceId<D> | null) => void,
      ] as const;
    },

    /**
     * Gives an Action its Handler while `enabled`. `repeat` overrides the
     * definition's: whether it Commits again while its last key stays down.
     */
    useAction: (
      id: ActionId<D>,
      handler: () => void,
      options: { readonly enabled?: boolean; readonly repeat?: boolean } = {},
    ) => {
      const { handlers } = useKeyboard('useAction');
      const run = useRef(handler);
      useLayoutEffect(() => {
        run.current = handler;
      });
      const enabled = options.enabled !== false;
      const { repeat } = options;
      useEffect(() => {
        if (!enabled) return;
        if (handlers.handler(id) !== undefined) {
          warn(`"${id}" has two Handlers; the first one keeps it.`);
        }
        return handlers.add(id, { run, repeat });
      }, [handlers, id, enabled, repeat]);
    },

    /** Every Action and where it stands, and any Sequence under way. */
    useStatus: (): Status<SurfaceId<D>, ActionId<D>> => {
      const { surface, resolution, handlers } = useKeyboard('useStatus');
      const version = useSyncExternalStore(
        handlers.subscribe,
        handlers.version,
        handlers.version,
      );
      return useMemo(
        () =>
          statusOf(surface, resolution, handlers.under()) as Status<
            SurfaceId<D>,
            ActionId<D>
          >,
        [surface, resolution, handlers, version],
      );
    },

    /**
     * Runs an Action as if its keys were pressed, Shadowed or not, when its
     * Surface is Active or around it and it has a Handler. Says whether it
     * ran.
     */
    useRun: () => {
      const { resolution, handlers } = useKeyboard('useRun');
      return (id: ActionId<D>) => {
        const action = resolution.actions.find((each) => each.id === id);
        const handler = handlers.handler(id);
        if (action === undefined || handler === undefined) return false;
        if (action.state !== 'active' && action.state !== 'shadowed') {
          return false;
        }
        handler.run.current();
        return true;
      };
    },
  };
};
