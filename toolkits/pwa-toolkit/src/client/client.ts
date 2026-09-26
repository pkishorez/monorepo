import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import type * as Option from 'effect/Option';
import type * as SubscriptionRef from 'effect/SubscriptionRef';
import type { BuildId } from '../domain/build/index.js';
import type { ClientBuildInfo } from '../domain/config/index.js';
import { readBuildIdMeta } from './build-id-meta.js';
import { makeConnectivity } from './connectivity.js';
import { makeDisplayMode } from './display-mode.js';
import { makeInstall } from './install.js';
import { register } from './registration.js';
import { clearRuntimeCaches } from './runtime-cache.js';
import type { DisplayModeValue, InstallState, UpdateState } from './states.js';
import { storagePersistence } from './storage-persistence.js';
import { makeUpdate } from './update.js';

export { type DisplayModeValue, InstallState, UpdateState } from './states.js';

/** The tab's registration of the toolkit's worker; none when unsupported or disabled. */
export class PwaRegistration extends Context.Service<
  PwaRegistration,
  {
    readonly registration: Option.Option<ServiceWorkerRegistration>;
    /** From the Build ID meta tag; none when the page has no tag. */
    readonly buildId: Option.Option<BuildId>;
  }
>()('pwa-toolkit/PwaRegistration') {}

/** Update Prompt state. Never reloads unasked; `apply` starts a Coordinated Reload. */
export class PwaUpdate extends Context.Service<
  PwaUpdate,
  {
    readonly state: SubscriptionRef.SubscriptionRef<UpdateState>;
    readonly check: Effect.Effect<void>;
    readonly apply: Effect.Effect<void>;
    /** Report a route change; applies an Available update in `auto-on-navigation` mode. */
    readonly navigated: Effect.Effect<void>;
  }
>()('pwa-toolkit/PwaUpdate') {}

/** Install Prompt state. Dismissal is remembered for 30 days. */
export class PwaInstall extends Context.Service<
  PwaInstall,
  {
    readonly state: SubscriptionRef.SubscriptionRef<InstallState>;
    readonly prompt: Effect.Effect<'accepted' | 'dismissed' | 'unavailable'>;
    readonly dismiss: Effect.Effect<void>;
  }
>()('pwa-toolkit/PwaInstall') {}

export class Connectivity extends Context.Service<
  Connectivity,
  { readonly online: SubscriptionRef.SubscriptionRef<boolean> }
>()('pwa-toolkit/Connectivity') {}

export class DisplayMode extends Context.Service<
  DisplayMode,
  { readonly mode: SubscriptionRef.SubscriptionRef<DisplayModeValue> }
>()('pwa-toolkit/DisplayMode') {}

/** Every member is none where the Storage API is missing. */
export class StoragePersistence extends Context.Service<
  StoragePersistence,
  {
    readonly persisted: Effect.Effect<Option.Option<boolean>>;
    readonly persist: Effect.Effect<Option.Option<boolean>>;
    readonly estimate: Effect.Effect<
      Option.Option<{ readonly usage: number; readonly quota: number }>
    >;
  }
>()('pwa-toolkit/StoragePersistence') {}

/** Deletes every Runtime Cache (use on sign-out). Needs no registration. */
export class RuntimeCacheControl extends Context.Service<
  RuntimeCacheControl,
  { readonly clear: Effect.Effect<void> }
>()('pwa-toolkit/RuntimeCacheControl') {
  static readonly layer: Layer.Layer<RuntimeCacheControl> = Layer.succeed(
    this,
    { clear: clearRuntimeCaches },
  );
}

export type PwaClientServices =
  | PwaRegistration
  | PwaUpdate
  | PwaInstall
  | Connectivity
  | DisplayMode
  | StoragePersistence
  | RuntimeCacheControl;

const registrationLayer = (config: ClientBuildInfo) =>
  Layer.effect(
    PwaRegistration,
    Effect.map(register(config), (registration) => ({
      registration,
      buildId: readBuildIdMeta(),
    })),
  );

const updateLayer = (config: ClientBuildInfo) =>
  Layer.effect(
    PwaUpdate,
    Effect.gen(function* () {
      const { registration } = yield* PwaRegistration;
      return yield* makeUpdate(config.update, registration);
    }),
  ).pipe(Layer.provideMerge(registrationLayer(config)));

/**
 * All tab-side services. Browser only: build it after hydration, never during
 * SSR (there every service is inert). Install, Connectivity and DisplayMode
 * do not wait for the registration, so no early browser event is missed.
 */
export const PwaClient = {
  layer: (config: ClientBuildInfo): Layer.Layer<PwaClientServices> =>
    Layer.mergeAll(
      updateLayer(config),
      Layer.effect(PwaInstall, makeInstall),
      Layer.effect(Connectivity, makeConnectivity),
      Layer.effect(DisplayMode, makeDisplayMode),
      Layer.succeed(StoragePersistence, storagePersistence),
      RuntimeCacheControl.layer,
    ),
};
