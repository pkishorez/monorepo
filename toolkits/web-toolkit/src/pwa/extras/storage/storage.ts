import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Option from 'effect/Option';
import { useEffect, useMemo, useState } from 'react';
import { lazyService } from '../lazy-service/index.js';

const storage = (): Option.Option<StorageManager> =>
  typeof navigator !== 'undefined' && navigator.storage !== undefined
    ? Option.some(navigator.storage)
    : Option.none();

const call = <K extends 'persisted' | 'persist' | 'estimate'>(
  method: K,
): Effect.Effect<Option.Option<Awaited<ReturnType<StorageManager[K]>>>> =>
  Effect.suspend(() =>
    Option.match(
      Option.filter(storage(), (s) => typeof s[method] === 'function'),
      {
        onNone: () => Effect.succeed(Option.none()),
        onSome: (s) =>
          Effect.tryPromise(
            () =>
              s[method]() as Promise<Awaited<ReturnType<StorageManager[K]>>>,
          ).pipe(Effect.map(Option.some), Effect.orElseSucceed(Option.none)),
      },
    ),
  );

/** Persistent storage and usage. Every member is none where the Storage API is missing. */
export class StoragePersistence extends Context.Service<
  StoragePersistence,
  {
    readonly persisted: Effect.Effect<Option.Option<boolean>>;
    readonly persist: Effect.Effect<Option.Option<boolean>>;
    readonly estimate: Effect.Effect<
      Option.Option<{ readonly usage: number; readonly quota: number }>
    >;
  }
>()('@kstackz/web-toolkit/pwa/StoragePersistence') {
  static readonly layer: Layer.Layer<StoragePersistence> = Layer.succeed(this, {
    persisted: call('persisted'),
    persist: call('persist'),
    estimate: call('estimate').pipe(
      Effect.map(
        Option.map((estimate) => ({
          usage: estimate.usage ?? 0,
          quota: estimate.quota ?? 0,
        })),
      ),
    ),
  });
}

const useStorageService = lazyService(
  StoragePersistence,
  StoragePersistence.layer,
);

const runOr = <A>(effect: Effect.Effect<A> | undefined, fallback: A) =>
  effect === undefined ? Promise.resolve(fallback) : Effect.runPromise(effect);

/** `null` while unknown or where the Storage API is missing. */
export const useStoragePersistence = (): {
  readonly persisted: boolean | null;
  readonly persist: () => Promise<boolean | null>;
  readonly estimate: () => Promise<{
    readonly usage: number;
    readonly quota: number;
  } | null>;
} => {
  const service = useStorageService();
  const [persisted, setPersisted] = useState<boolean | null>(null);

  useEffect(() => {
    if (service === undefined) return;
    let mounted = true;
    void Effect.runPromise(service.persisted).then(
      (value) => mounted && setPersisted(Option.getOrNull(value)),
    );
    return () => {
      mounted = false;
    };
  }, [service]);

  return useMemo(
    () => ({
      persisted,
      persist: async () => {
        const value = Option.getOrNull(
          await runOr(service?.persist, Option.none()),
        );
        setPersisted(value);
        return value;
      },
      estimate: async () =>
        Option.getOrNull(await runOr(service?.estimate, Option.none())),
    }),
    [persisted, service],
  );
};
