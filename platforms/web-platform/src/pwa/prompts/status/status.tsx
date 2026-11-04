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
import info, { included } from 'virtual:pwa-toolkit/client';
import { useSubscriptionRef } from '../../engine/contract/subscription-ref.js';
import {
  clearRuntimeCache as clearRuntimeCacheEffect,
  Pwa,
  PwaStatus,
} from '../../engine/page/index.js';
import {
  type HeadTags,
  headTags,
  pageVersion,
  type PwaVersion,
} from './head.js';

/**
 * The service `PwaProvider` built: `pwa` is `null` outside it, during SSR,
 * and until it is built. `started` is false only inside it, until the
 * service is built or has failed to, so there is nothing more to wait for.
 */
interface PwaService {
  readonly pwa: Pwa['Service'] | null;
  readonly started: boolean;
}

const OUTSIDE: PwaService = { pwa: null, started: true };
const STARTING: PwaService = { pwa: null, started: false };
const PwaContext = createContext<PwaService>(OUTSIDE);

/** The service, for the Web Platform's own prompts. */
export const usePwaService = (): PwaService => useContext(PwaContext);

const UNSUPPORTED = PwaStatus.Unsupported();

/**
 * Registers the service worker after mount (never during SSR) and gives
 * `usePwa` its status. Render it once, in the root route.
 */
export const PwaProvider = (props: {
  readonly children?: ReactNode;
}): ReactNode => {
  const [service, setService] = useState<PwaService>(STARTING);

  useEffect(() => {
    const runtime = ManagedRuntime.make(Pwa.layer(info));
    let mounted = true;
    runtime.context().then(
      (context) => {
        if (mounted)
          setService({ pwa: Context.get(context, Pwa), started: true });
      },
      (error: unknown) => {
        console.error('pwa-toolkit: client failed to start', error);
        if (mounted) setService(OUTSIDE);
      },
    );
    return () => {
      mounted = false;
      setService(STARTING);
      void runtime.dispose();
    };
  }, []);

  return (
    <PwaContext.Provider value={service}>{props.children}</PwaContext.Provider>
  );
};

/**
 * The PWA's status with `checkForUpdate` and `applyUpdate`, and the
 * `version` this page runs. `checkForUpdate` resolves only once a newer
 * build it found is downloaded, so `UpdateReady` is known by then. `status` is `Unsupported` during SSR and until
 * `PwaProvider` has started; `version` is known from the first render.
 */
export const usePwa = (): {
  readonly status: PwaStatus;
  readonly version: PwaVersion;
  /** Resolves once the check is done: `true` when a newer build is downloaded and waiting. */
  readonly checkForUpdate: () => Promise<boolean>;
  readonly applyUpdate: () => Promise<void>;
} => {
  const { pwa } = useContext(PwaContext);
  const status = useSubscriptionRef(pwa?.status, UNSUPPORTED);
  const version = useMemo(() => pageVersion(info), []);
  return useMemo(
    () => ({
      status,
      version,
      checkForUpdate: () =>
        pwa === null
          ? Promise.resolve(false)
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

/**
 * Head tags for the root route: manifest link, Apple icon, and the meta
 * tags for the Build ID (read by Worker RPC), build time and commit.
 * Hydration-safe: in the browser they come from the tags the server rendered.
 */
export const pwaHead = (): HeadTags => headTags(info, pageVersion(info));

/** The app's name, as `pwa({ name })` gave it to the manifest. */
export const pwaName = (): string => info.name;

/** Whether this build is a PWA: `false` when it was built with `noPwa()`. */
export const pwaIncluded = (): boolean => included;
