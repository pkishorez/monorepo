import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as ManagedRuntime from 'effect/ManagedRuntime';
import * as Option from 'effect/Option';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import info from 'virtual:pwa-toolkit/client';
import {
  Connectivity,
  DisplayMode,
  type DisplayModeValue,
  InstallState,
  PwaClient,
  type PwaClientServices,
  PwaInstall,
  PwaUpdate,
  RuntimeCacheControl,
  StoragePersistence,
  UpdateState,
} from '../client/index.js';
import { type HeadTags, headTags, pageBuildId } from './head.js';
import { ServicesContext, useServices } from './services-context.js';
import { useSubscriptionRef } from './subscription-ref.js';

/** Structural slice of a TanStack Router instance; used for `auto-on-navigation`. */
interface NavigationSource {
  readonly subscribe: (event: 'onResolved', listener: () => void) => () => void;
}

const IDLE = UpdateState.Idle();
const INSTALL_UNSUPPORTED = InstallState.Unsupported();

const runOr = <A,>(effect: Effect.Effect<A> | undefined, fallback: A) =>
  effect === undefined ? Promise.resolve(fallback) : Effect.runPromise(effect);

const useService = <I, S>(key: Context.Key<I, S>): S | undefined => {
  const services = useServices();
  return services === null
    ? undefined
    : Context.get(services as Context.Context<I>, key);
};

/**
 * Builds one PwaClient runtime after mount (never during SSR) from
 * `virtual:pwa-toolkit/client`. Pass `router` so `auto-on-navigation` sees route changes.
 */
export const PwaProvider = (props: {
  readonly children?: ReactNode;
  readonly router?: NavigationSource;
}): ReactNode => {
  const [services, setServices] =
    useState<Context.Context<PwaClientServices> | null>(null);

  useEffect(() => {
    const runtime = ManagedRuntime.make(PwaClient.layer(info));
    let mounted = true;
    runtime.context().then(
      (context) => mounted && setServices(context),
      (error: unknown) =>
        console.error('pwa-toolkit: client failed to start', error),
    );
    return () => {
      mounted = false;
      setServices(null);
      void runtime.dispose();
    };
  }, []);

  const { router } = props;
  useEffect(() => {
    if (router === undefined || services === null) return;
    const update = Context.get(services, PwaUpdate);
    return router.subscribe('onResolved', () => {
      Effect.runFork(update.navigated);
    });
  }, [router, services]);

  return (
    <ServicesContext.Provider value={services}>
      {props.children}
    </ServicesContext.Provider>
  );
};

/** Before mount and during SSR: `Idle`. */
export const usePwaUpdate = (): {
  readonly state: UpdateState;
  readonly check: () => Promise<void>;
  readonly apply: () => Promise<void>;
} => {
  const update = useService(PwaUpdate);
  const state = useSubscriptionRef(update?.state, IDLE);
  return useMemo(
    () => ({
      state,
      check: () => runOr(update?.check, undefined),
      apply: () => runOr(update?.apply, undefined),
    }),
    [state, update],
  );
};

/** Before mount and during SSR: `Unsupported`. */
export const usePwaInstall = (): {
  readonly state: InstallState;
  readonly prompt: () => Promise<'accepted' | 'dismissed' | 'unavailable'>;
  readonly dismiss: () => void;
} => {
  const install = useService(PwaInstall);
  const state = useSubscriptionRef(install?.state, INSTALL_UNSUPPORTED);
  return useMemo(
    () => ({
      state,
      prompt: () => runOr(install?.prompt, 'unavailable' as const),
      dismiss: () => void runOr(install?.dismiss, undefined),
    }),
    [state, install],
  );
};

/** Before mount and during SSR: `true`. */
export const useOnline = (): boolean =>
  useSubscriptionRef(useService(Connectivity)?.online, true);

/** Before mount and during SSR: `'browser'`. */
export const useDisplayMode = (): DisplayModeValue =>
  useSubscriptionRef(useService(DisplayMode)?.mode, 'browser');

/** `null` while unknown or where the Storage API is missing. */
export const useStoragePersistence = (): {
  readonly persisted: boolean | null;
  readonly persist: () => Promise<boolean | null>;
  readonly estimate: () => Promise<{
    readonly usage: number;
    readonly quota: number;
  } | null>;
} => {
  const storage = useService(StoragePersistence);
  const [persisted, setPersisted] = useState<boolean | null>(null);

  useEffect(() => {
    if (storage === undefined) return;
    let mounted = true;
    void Effect.runPromise(storage.persisted).then(
      (value) => mounted && setPersisted(Option.getOrNull(value)),
    );
    return () => {
      mounted = false;
    };
  }, [storage]);

  return useMemo(
    () => ({
      persisted,
      persist: async () => {
        const value = Option.getOrNull(
          await runOr(storage?.persist, Option.none()),
        );
        setPersisted(value);
        return value;
      },
      estimate: async () =>
        Option.getOrNull(await runOr(storage?.estimate, Option.none())),
    }),
    [persisted, storage],
  );
};

/** Deletes every Runtime Cache. Works outside `PwaProvider` (e.g. in sign-out). */
export const clearRuntimeCache = (): Promise<void> =>
  Effect.runPromise(
    Effect.flatMap(RuntimeCacheControl, (control) => control.clear).pipe(
      Effect.provide(RuntimeCacheControl.layer),
    ),
  );

/**
 * Head tags for the root route: manifest link, Apple meta and icon, and the
 * Build ID meta tag. The app's theme integration owns the live theme color.
 * Hydration-safe: in the browser the Build ID comes from the existing tag.
 */
export const pwaHead = (): HeadTags => headTags(info, pageBuildId(info));
