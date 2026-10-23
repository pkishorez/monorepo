import { Data, Deferred, Effect, Scope } from 'effect';
import type { QueryDefinition, Tagged } from '../../actor/index.ts';
import type { Own } from './self.ts';

/*
 * Queries: questions an Instance answers from outside the tree, from what
 * it holds and what its Services know, changing nothing. One runs in the
 * asker's own fiber, as its Instance, with the Capabilities from above and
 * a Scope of its own that closes when it has answered. While it runs it is
 * Asked at the level it is written in, the Instance or its State: when that
 * level ends, or the app starts over, every Query Asked there is cancelled
 * at once, before any finalizer runs, and its asker learns it was Stopped.
 */

/** The Instance a Query was asked of has stopped, or left the State the Query is written in, before or while answering. */
export class Stopped extends Data.TaggedError('Stopped')<{
  readonly instance: string;
  readonly query: string;
}> {}

/** The Queries being answered at one level, each as the way to cancel it. */
export class Asked {
  readonly #cancels = new Set<() => void>();
  /** Cancels every Query Asked here: each fails as Stopped. */
  cancel() {
    for (const each of this.#cancels) each();
    this.#cancels.clear();
  }
  /** Holds `cancel` until the Query ends. */
  hold(cancel: () => void) {
    this.#cancels.add(cancel);
    return () => void this.#cancels.delete(cancel);
  }
}

/** Asks one Query of an Instance; its answer, or `Stopped`. */
export const ask = (
  own: Own,
  definition: QueryDefinition,
  name: string,
  args: unknown,
  state: Tagged,
  at: ReadonlyArray<Asked>,
): Effect.Effect<unknown, unknown> =>
  Effect.gen(function* () {
    const refused = new Stopped({ instance: own.self.id, query: name });
    if (definition.state !== undefined && definition.state !== state._tag)
      return yield* refused;
    const { send: _, ...self } = own.self;
    const cancelled = yield* Deferred.make<never, Stopped>();
    const cancel = () =>
      void Deferred.doneUnsafe(cancelled, Effect.fail(refused));
    const answer = Effect.flatMap(Deferred.await(own.above), (services) =>
      Effect.scoped(
        (
          definition.run(self, args) as Effect.Effect<unknown, unknown, any>
        ).pipe(Effect.provideContext(services)),
      ),
    ) as Effect.Effect<unknown, unknown>;
    return yield* Effect.acquireUseRelease(
      Effect.sync(() => at.map((asked) => asked.hold(cancel))),
      () => Effect.raceFirst(answer, Deferred.await(cancelled)),
      (releases) => Effect.sync(() => releases.forEach((release) => release())),
    );
  });
