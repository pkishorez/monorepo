import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import type * as Option from 'effect/Option';
import type * as SubscriptionRef from 'effect/SubscriptionRef';
import type { BuildId } from '../shared/build/index.js';
import type { ClientBuildInfo } from '../shared/config/index.js';
import { readBuildIdMeta } from './build-id-meta.js';
import { register } from './registration.js';
import { clearRuntimeCaches } from './runtime-cache.js';
import type { UpdateState } from './states.js';
import { makeUpdate } from './update/index.js';

export { UpdateState } from './states.js';

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
 * Every client service. Browser only: build it after hydration, never during
 * SSR (there every service is inert).
 */
export const PwaClient = {
  layer: (config: ClientBuildInfo): Layer.Layer<PwaClientServices> =>
    Layer.mergeAll(updateLayer(config), RuntimeCacheControl.layer),
};
