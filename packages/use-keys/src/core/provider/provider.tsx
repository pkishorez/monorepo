import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import type { Key, Keys } from '../key/index.ts';
import { createKeyInput } from '../key-input/index.ts';
import type { Cancel, Step } from '../keymap/index.ts';
import { development } from './development.ts';
import {
  createDispatcher,
  type Dispatcher,
  type KeysEnd,
  type Timing,
} from './dispatcher.ts';

export type { Key } from '../key/index.ts';
export type { Cancel, Shortcut, Step } from '../keymap/index.ts';

const ProviderContext = createContext<Dispatcher | undefined>(undefined);

const DEFAULT_TIMING: Timing = { delay: 500, interval: 100, timeout: 1000 };

export type KeysProviderProps = {
  /** Whether every listener in it hears keys: true by default. */
  readonly enabled?: boolean;
  /**
   * How a held key Repeats a Shortcut that asks to: after `delay` ms, then
   * every `interval` ms. `{ delay: 500, interval: 100 }` by default.
   */
  readonly repeat?: { readonly delay?: number; readonly interval?: number };
  /** How long, in ms, a Sequence waits for its next step: 1000 by default. */
  readonly sequence?: { readonly timeout?: number };
  readonly children?: ReactNode;
};

/**
 * Hears every key on the page for the listeners inside it, and calls each
 * Enabled one. Put one at the app's root; every `useKeys`, `useShortcut`
 * and `useSequence` must be inside one. One inside another adds nothing:
 * its listeners join the outer one, and its own options are ignored.
 */
export function KeysProvider(props: KeysProviderProps) {
  const outer = useContext(ProviderContext);
  const nested =
    props.enabled !== undefined ||
    props.repeat !== undefined ||
    props.sequence !== undefined;
  const ignored = outer !== undefined && nested;
  useEffect(() => {
    if (ignored && development()) {
      console.warn(
        'use-keys: a KeysProvider inside another ignores its own enabled, repeat and sequence.',
      );
    }
  }, [ignored]);
  return outer === undefined ? <Provider {...props} /> : props.children;
}

const isApple = () =>
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad|iPod/.test(navigator.platform);

function Provider(props: KeysProviderProps) {
  const latest = useLatest(props);
  const [{ mac, dispatcher }] = useState(() => {
    const apple = isApple();
    return {
      mac: apple,
      dispatcher: createDispatcher({
        mac: apple,
        timing: (): Timing => ({
          ...DEFAULT_TIMING,
          ...latest.current.repeat,
          ...latest.current.sequence,
        }),
        clock: {
          now: () => performance.now(),
          schedule: (run, ms) => {
            const timer = setTimeout(run, ms);
            return () => clearTimeout(timer);
          },
        },
      }),
    };
  });

  // Listens only while Enabled; turning it off lifts every key.
  const enabled = props.enabled !== false;
  useEffect(() => {
    if (typeof window === 'undefined' || !enabled) return;
    const input = createKeyInput(window, dispatcher.sink, { mac });
    input.start();
    return input.stop;
  }, [dispatcher, mac, enabled]);

  useEffect(() => devtools(dispatcher), [dispatcher]);

  return <ProviderContext value={dispatcher}>{props.children}</ProviderContext>;
}

// In development, lists each provider's Keys and declared keys on
// `globalThis.__USE_KEYS__`, for the console and devtools.
const devtools = (dispatcher: Dispatcher) => {
  if (!development()) return () => {};
  const global = globalThis as { __USE_KEYS__?: Set<unknown> };
  const shown = { keys: dispatcher.keys, declared: dispatcher.declared };
  (global.__USE_KEYS__ ??= new Set()).add(shown);
  return () => global.__USE_KEYS__?.delete(shown);
};

// The nearest Keys Provider; hooks throw a clear error outside one.
const useDispatcher = (user: string) => {
  const dispatcher = useContext(ProviderContext);
  if (dispatcher === undefined) {
    throw new Error(`${user} must be used inside a KeysProvider`);
  }
  return dispatcher;
};

// The latest options, read mid-Keys without registering again.
const useLatest = <T,>(value: T) => {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
};

const NONE: Keys = [];

export type KeysOptions = {
  /** Whether it hears the next Keys: true by default. Read as their first Key goes down. */
  readonly enabled?: boolean;
  /** The first Key went down. */
  readonly onStart?: (keys: Keys) => void;
  /** A Key went down or lifted; `key` is that Key. */
  readonly onKey?: (key: Key, keys: Keys) => void;
  /** The last Key lifted, or the page lost focus, `interrupted`. */
  readonly onEnd?: (keys: Keys, end: KeysEnd) => void;
};

/**
 * Watches every key the page may hear: each Key from the first going down
 * until the last lifts, lifted ones included. It never Takes a key, so any
 * number of listeners can watch the same one. Keys typed in Text Entry, and
 * in elements marked `data-keys="disabled"`, are not heard; Shift, Ctrl,
 * Alt and Cmd always are.
 */
export function useKeys(options: KeysOptions = {}): {
  /** The Keys under way; empty between them. */
  readonly keys: Keys;
  /** True from the first Key going down until the last lifts. */
  readonly active: boolean;
} {
  const dispatcher = useDispatcher('useKeys');
  const latest = useLatest(options);
  const [keys, setKeys] = useState(NONE);

  useEffect(
    () =>
      dispatcher.watch({
        enabled: () => latest.current.enabled !== false,
        start: (next) => {
          setKeys(next);
          latest.current.onStart?.(next);
        },
        key: (key, next) => {
          setKeys(next);
          latest.current.onKey?.(key, next);
        },
        end: (last, end) => {
          latest.current.onEnd?.(last, end);
          setKeys(NONE);
        },
      }),
    [dispatcher, latest],
  );

  return { keys, active: keys.length > 0 };
}

type DeclareOptions = {
  readonly enabled: boolean;
  readonly inTextEntry: boolean;
  readonly repeat: boolean;
  readonly onCommit: () => void;
  readonly onPossible?: () => void;
  readonly onCancel?: (reason: Cancel) => void;
};

/**
 * Waits for `paths` in the nearest Keys Provider while `enabled`, and
 * Takes their keys: for the hooks built on the core. Throws in development
 * when they conflict with another Enabled Shortcut or Sequence.
 */
export function useDeclare(
  user: string,
  paths: ReadonlyArray<ReadonlyArray<Step>>,
  options: DeclareOptions,
) {
  const dispatcher = useDispatcher(user);
  const latest = useLatest({ ...options, paths });
  const { enabled, inTextEntry } = options;
  // Paths are compared by what they say, so inline ones do not re-declare.
  const said = JSON.stringify(paths);

  // A Conflict throws here, to the nearest error boundary.
  useEffect(() => {
    if (!enabled) return;
    return dispatcher.declare(
      { paths: latest.current.paths, inTextEntry },
      {
        commit: () => latest.current.onCommit(),
        possible: () => latest.current.onPossible?.(),
        cancel: (reason) => latest.current.onCancel?.(reason),
        repeat: () => latest.current.repeat,
      },
    );
  }, [dispatcher, latest, enabled, inTextEntry, said]);
}
