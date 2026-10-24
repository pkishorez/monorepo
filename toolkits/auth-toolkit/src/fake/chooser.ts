import { Deferred, Effect } from 'effect';

/** Who to sign in as: an email, and optionally a name. */
export interface FakeChoice {
  readonly email: string;
  readonly name?: string;
}

/** A `choose` that a dialog answers: `choose` waits until `answer` is called,
 * and `subscribe` and `isAsking` tell the dialog when to show. */
export const makeChooser = () => {
  let asking: Deferred.Deferred<FakeChoice | null> | null = null;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());

  const choose: Effect.Effect<FakeChoice | null> = Effect.gen(function* () {
    const deferred = yield* Deferred.make<FakeChoice | null>();
    if (asking !== null) Deferred.doneUnsafe(asking, Effect.succeed(null));
    asking = deferred;
    notify();
    return yield* Deferred.await(deferred);
  }).pipe(
    Effect.ensuring(
      Effect.sync(() => {
        asking = null;
        notify();
      }),
    ),
  );

  return {
    choose,
    /** Whether a sign-in is waiting for an answer. */
    isAsking: () => asking !== null,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    /** Answers the waiting sign-in; null signs nobody in. */
    answer: (choice: FakeChoice | null) => {
      if (asking !== null) Deferred.doneUnsafe(asking, Effect.succeed(choice));
    },
  };
};
