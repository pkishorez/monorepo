import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as SubscriptionRef from 'effect/SubscriptionRef';
import { isBrowser, listen } from '../../browser/dom-events.js';
import { useSubscriptionRef } from '../../browser/subscription-ref.js';
import { lazyService } from '../lazy-service/index.js';

/** `navigator.onLine`: false means surely offline; true only means a network exists. */
export class Online extends Context.Service<
  Online,
  { readonly online: SubscriptionRef.SubscriptionRef<boolean> }
>()('@kstackz/pwa-toolkit/Online') {
  static readonly layer: Layer.Layer<Online> = Layer.effect(
    this,
    Effect.gen(function* () {
      const online = yield* SubscriptionRef.make(
        isBrowser() ? navigator.onLine : true,
      );
      if (isBrowser()) {
        const set = (value: boolean) => () =>
          Effect.runSync(SubscriptionRef.set(online, value));
        yield* listen(window, 'online', set(true));
        yield* listen(window, 'offline', set(false));
      }
      return { online };
    }),
  );
}

const useOnlineService = lazyService(Online, Online.layer);

/** Whether the browser is online; `true` during SSR and until known. */
export const useOnline = (): boolean =>
  useSubscriptionRef(useOnlineService()?.online, true);
