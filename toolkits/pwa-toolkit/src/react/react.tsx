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
import info from 'virtual:pwa-toolkit/client';
import { useSubscriptionRef } from '../browser/subscription-ref.js';
import {
  clearRuntimeCache as clearRuntimeCacheEffect,
  Pwa,
  PwaStatus,
} from '../client/index.js';
import { type HeadTags, headTags, pageBuildId } from './head.js';

/** `null` outside `PwaProvider`, during SSR, and until the service is built. */
const PwaContext = createContext<Pwa['Service'] | null>(null);

const UNSUPPORTED = PwaStatus.Unsupported();

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
      (context) => mounted && setPwa(Context.get(context, Pwa)),
      (error: unknown) =>
        console.error('pwa-toolkit: client failed to start', error),
    );
    return () => {
      mounted = false;
      setPwa(null);
      void runtime.dispose();
    };
  }, []);

  return (
    <PwaContext.Provider value={pwa}>{props.children}</PwaContext.Provider>
  );
};

/**
 * The PWA's status with `checkForUpdate` and `applyUpdate`. `Unsupported`
 * during SSR and until `PwaProvider` has started.
 */
export const usePwa = (): {
  readonly status: PwaStatus;
  readonly checkForUpdate: () => Promise<void>;
  readonly applyUpdate: () => Promise<void>;
} => {
  const pwa = useContext(PwaContext);
  const status = useSubscriptionRef(pwa?.status, UNSUPPORTED);
  return useMemo(
    () => ({
      status,
      checkForUpdate: () =>
        pwa === null
          ? Promise.resolve()
          : Effect.runPromise(pwa.checkForUpdate),
      applyUpdate: () =>
        pwa === null ? Promise.resolve() : Effect.runPromise(pwa.applyUpdate),
    }),
    [status, pwa],
  );
};

/** Deletes every Runtime Cache. Works outside `PwaProvider` (e.g. in sign-out). */
export const clearRuntimeCache = (): Promise<void> =>
  Effect.runPromise(clearRuntimeCacheEffect);

/**
 * Head tags for the root route: manifest link, Apple icon, and the Build ID
 * meta tag (read by Worker RPC). Hydration-safe: in the browser the Build ID
 * comes from the tag the server rendered.
 */
export const pwaHead = (): HeadTags => headTags(info, pageBuildId(info));
