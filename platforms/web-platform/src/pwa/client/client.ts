import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import type { ClientBuildInfo } from '../shared/config/index.js';
import { register } from './registration.js';
import { clearRuntimeCaches } from './runtime-cache.js';
import { makeStatus, type StatusService } from './status/index.js';

export { PwaStatus } from './status/index.js';

/**
 * The PWA as the page sees it: one `status` stream, and the two things the
 * page can do about updates. Never reloads unasked; `applyUpdate` activates
 * the waiting build and every open page reloads into it.
 */
export class Pwa extends Context.Service<
  Pwa,
  StatusService & {
    /** Deletes every Runtime Cache (use on sign-out); the Precache stays. */
    readonly clearRuntimeCache: Effect.Effect<void>;
  }
>()('@kstackz/web-platform/pwa/Pwa') {
  /**
   * Registers the worker and watches it. Browser only: build it after
   * hydration, never during SSR (there it is `Unsupported`).
   */
  static layer(info: ClientBuildInfo): Layer.Layer<Pwa> {
    return Layer.effect(
      this,
      Effect.gen(function* () {
        const registration = yield* register(info);
        const status = yield* makeStatus(info.update, registration);
        return { ...status, clearRuntimeCache: clearRuntimeCaches };
      }),
    );
  }
}

/**
 * Deletes every Runtime Cache straight from CacheStorage, which the page
 * shares with the worker, so it needs no registration or `Pwa` service.
 */
export const clearRuntimeCache: Effect.Effect<void> = clearRuntimeCaches;
