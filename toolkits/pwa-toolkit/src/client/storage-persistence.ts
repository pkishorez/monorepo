import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';

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

export const storagePersistence = {
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
};
