import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as ManagedRuntime from 'effect/ManagedRuntime';
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import info from 'virtual:web-platform/pwa/client';
import { useSubscriptionRef } from '../kit/subscription-ref.js';
import {
  clearRuntimeCache as clearRuntimeCacheEffect,
  Pwa,
  PwaStatus,
} from './client/index.js';
import { type PwaVersion, pwaVersion } from '../head/index.js';

/** `null` outside `PwaProvider`, during SSR, and until the service is built. */
const PwaContext = createContext<Pwa['Service'] | null>(null);

const UNSUPPORTED = PwaStatus.Unsupported();

/** The service `PwaProvider` built, for `updateToNewest`; null until then. */
let built: Pwa['Service'] | null = null;
let toNewest = false;

/**
 * Moves the page to the newest build, once per page load, from anywhere: an
 * app calls it when it finds it is older than what it talks to. It checks
 * for a newer build and applies it once it is downloaded, and every open
 * page reloads into it; asked before `PwaProvider` has started, it waits for
 * it. Without a service worker, as in development, it does nothing.
 */
export const updateToNewest = (): void => {
  toNewest = true;
  if (built !== null) Effect.runFork(built.updateToNewest);
};

/**
 * Registers the service worker after mount (never during SSR) and gives
 * `usePwa` its status. Render it once, in the root route.
 */
export const PwaProvider = (props: {
  readonly children?: ReactNode;
}): ReactNode => {
  const [pwa, setPwa] = useState<Pwa['Service'] | null>(null);

  useEffect(() => {
    const runtime = ManagedRuntime.make(Pwa.layer(info));
    let mounted = true;
    runtime.context().then(
      (context) => {
        if (!mounted) return;
        built = Context.get(context, Pwa);
        setPwa(built);
        if (toNewest) Effect.runFork(built.updateToNewest);
      },
      (error: unknown) =>
        console.error('web-platform/pwa: client failed to start', error),
    );
    return () => {
      mounted = false;
      built = null;
      setPwa(null);
      void runtime.dispose();
    };
  }, []);

  return (
    <PwaContext.Provider value={pwa}>{props.children}</PwaContext.Provider>
  );
};

/**
 * The PWA's status with `checkForUpdate` and `applyUpdate`, and the
 * `version` this page runs. `status` is `Unsupported` during SSR and until
 * `PwaProvider` has started; `version` is known from the first render.
 */
export const usePwa = (): {
  readonly status: PwaStatus;
  readonly version: PwaVersion;
  readonly checkForUpdate: () => Promise<void>;
  readonly applyUpdate: () => Promise<void>;
} => {
  const pwa = useContext(PwaContext);
  const status = useSubscriptionRef(pwa?.status, UNSUPPORTED);
  const version = useMemo(pwaVersion, []);
  return useMemo(
    () => ({
      status,
      version,
      checkForUpdate: () =>
        pwa === null
          ? Promise.resolve()
          : Effect.runPromise(pwa.checkForUpdate),
      applyUpdate: () =>
        pwa === null ? Promise.resolve() : Effect.runPromise(pwa.applyUpdate),
    }),
    [status, version, pwa],
  );
};

/** Deletes every Runtime Cache. Works outside `PwaProvider` (e.g. in sign-out). */
export const clearRuntimeCache = (): Promise<void> =>
  Effect.runPromise(clearRuntimeCacheEffect);
