import { Cause, Clock, Deferred, Effect, Layer, Stream } from 'effect';
import type { Outcome } from '../route/index.ts';
import { Loading } from './loading.ts';
import type { Answer, RoutesWithPlaces, Wanted } from './loading.ts';

/*
 * The Data cache: the last data each place loaded, one copy per name and
 * what its Loader is handed, newest wins. It sits in front of another
 * `Loading` and lives as long as the Layer, so in a browser, as long as the
 * tab; a server has none.
 *
 * 1. Keep    every place loaded, up to `size` copies, each with when it
 *            arrived; the least recently used goes first, never one for its
 *            age. A failure is never kept.
 * 2. Answer  from a copy unless asked `fresh`: `stale` once it is older
 *            than its place's Stale time; a static place's never is.
 * 3. Join    a place already being loaded: a click during a preload waits
 *            for the same answer rather than asking again. A fresh ask, a
 *            reload's, joins nothing, and an answer is kept only if nothing
 *            asked later is, and the copies were not dropped since.
 * 4. Batch   the places asked for in the same moment into one ask of the
 *            Loading behind, so many places loading at once are one
 *            request, each answered as it comes. The load runs on its own:
 *            a place that stops waiting does not stop it, and its answer is
 *            still kept.
 * 5. Seed    with the data a server drew the page with, so a page first
 *            seen from the server is kept as one loaded in the browser is,
 *            arrived as the app starts.
 *
 * A preload loads only the places with no fresh copy.
 */

/** Asks of one batch, split so no ask names a place twice: answers come back by name. */
const rounds = <T extends { readonly place: Wanted }>(
  asks: ReadonlyArray<T>,
): ReadonlyArray<ReadonlyArray<T>> => {
  const out: Array<Array<T>> = [];
  for (const ask of asks) {
    const round = out.find((each) =>
      each.every((other) => other.place.name !== ask.place.name),
    );
    if (round) round.push(ask);
    else out.push([ask]);
  }
  return out;
};

const reasonOf = (cause: Cause.Cause<unknown>) => {
  const error = Cause.squash(cause);
  return error instanceof Error ? error.message : String(error);
};

/**
 * A `Loading` that keeps what `inner` loads, for the places of `routes`:
 * `Router.cached(Routes, loading(Routes))`. `size` copies at most, 50
 * unless said.
 */
export const cached = <E, R>(
  routes: RoutesWithPlaces,
  inner: Layer.Layer<Loading, E, R>,
  options?: { readonly size?: number },
): Layer.Layer<Loading, E, R> =>
  Layer.effect(
    Loading,
    Effect.gen(function* () {
      const source = yield* Loading;
      const size = options?.size ?? 50;
      const staleTimes = new Map(
        routes.every.map((place) => [place.name, place.staleTime]),
      );
      type Ask = {
        readonly key: string;
        readonly place: Wanted;
        readonly answer: Deferred.Deferred<Outcome>;
        /** When it was asked, counted: a copy is kept only from an answer asked after the one kept. */
        readonly seq: number;
      };
      type Copy = {
        readonly data: unknown;
        readonly seq: number;
        /** When it arrived, in milliseconds. */
        readonly at: number;
      };
      // 1. Keep
      const copies = new Map<string, Copy>();
      /** Whether a copy of the place is younger than its Stale time. */
      const freshOf = (place: Wanted, copy: Copy, now: number) =>
        now - copy.at < (staleTimes.get(place.name) ?? 0);
      const flying = new Map<string, Ask>();
      let batch: Array<Ask> = [];
      let asked = 0;
      /** The last ask before the copies were dropped: no answer to one asked by then is kept. */
      let forgotten = 0;

      const keyOf = (place: Wanted) =>
        JSON.stringify([place.name, place.params]);
      const keep = (key: string, copy: Copy) => {
        copies.delete(key);
        copies.set(key, copy);
        for (const oldest of copies.keys()) {
          if (copies.size <= size) break;
          copies.delete(oldest);
        }
      };

      // 4. Batch
      /** Settles one ask with what its place came to, and keeps its data, unless a newer ask's is kept or the copies were dropped since. */
      const settle = (ask: Ask, outcome: Outcome) =>
        Effect.flatMap(Clock.currentTimeMillis, (at) => {
          const { key, answer, seq } = ask;
          if (flying.get(key) === ask) flying.delete(key);
          if (
            outcome._tag === 'Loaded' &&
            seq > forgotten &&
            seq > (copies.get(key)?.seq ?? 0)
          )
            keep(key, { data: outcome.data, seq, at });
          return Deferred.succeed(answer, outcome);
        });
      /** Asks the Loading behind for a batch, each settled as it comes if it can say so, and any left unanswered broken. */
      const ask = (asks: ReadonlyArray<Ask>) => {
        const places = asks.map(({ place }) => place);
        const byName = new Map(asks.map((each) => [each.place.name, each]));
        const answered = source.each
          ? Stream.runForEach(source.each(places), ([name, outcome]) => {
              const found = byName.get(name);
              if (!found) return Effect.void;
              byName.delete(name);
              return settle(found, outcome);
            })
          : Effect.flatMap(source.load(places), (answers) =>
              Effect.forEach(asks, (each) => {
                const outcome = answers[each.place.name];
                if (!outcome) return Effect.void;
                byName.delete(each.place.name);
                return settle(each, outcome);
              }),
            );
        const left = (reason: (name: string) => string) =>
          Effect.forEach([...byName.values()], (each) =>
            settle(each, { _tag: 'Broken', reason: reason(each.place.name) }),
          );
        return answered.pipe(
          Effect.andThen(left((name) => `no answer for ${name}`)),
          Effect.catchCause((cause) => left(() => reasonOf(cause))),
        );
      };
      const flush = Effect.sleep(0).pipe(
        Effect.andThen(
          Effect.suspend(() => {
            const taken = batch;
            batch = [];
            return Effect.forEach(rounds(taken), ask, {
              concurrency: 'unbounded',
            });
          }),
        ),
      );
      /**
       * The place's answer, being loaded: joined if it already is, else
       * added to the batch. A fresh ask joins nothing: what is on its way
       * was asked before it.
       */
      const loading = (place: Wanted, fresh = false) =>
        Effect.suspend(() => {
          const key = keyOf(place);
          // 3. Join
          const going = flying.get(key);
          if (going && !fresh) return Effect.succeed(going.answer);
          const answer = Deferred.makeUnsafe<Outcome>();
          const ask: Ask = { key, place, answer, seq: (asked += 1) };
          flying.set(key, ask);
          batch.push(ask);
          return batch.length === 1
            ? Effect.as(Effect.forkDetach(flush), answer)
            : Effect.succeed(answer);
        });

      // 2. Answer
      const one = (place: Wanted, fresh: boolean): Effect.Effect<Answer> =>
        Effect.flatMap(Clock.currentTimeMillis, (now) => {
          const key = keyOf(place);
          const copy = copies.get(key);
          if (!fresh && copy) {
            keep(key, copy);
            return Effect.succeed<Answer>({
              _tag: 'Loaded',
              data: copy.data,
              stale: !freshOf(place, copy, now),
            });
          }
          return Effect.flatMap(loading(place, fresh), Deferred.await);
        });

      return {
        load: (places, options) =>
          Effect.forEach(
            places,
            (place) =>
              Effect.map(
                one(place, options?.fresh === true),
                (answer) => [place.name, answer] as const,
              ),
            { concurrency: 'unbounded' },
          ).pipe(Effect.map((answers) => Object.fromEntries(answers))),
        preload: (places) =>
          Effect.flatMap(Clock.currentTimeMillis, (now) =>
            Effect.forEach(
              places.filter((place) => {
                const copy = copies.get(keyOf(place));
                return !copy || !freshOf(place, copy, now);
              }),
              (place) => loading(place),
              { discard: true },
            ),
          ),
        // 5. Seed
        keep: (place, data) =>
          Effect.flatMap(Clock.currentTimeMillis, (at) =>
            Effect.sync(() => {
              const key = keyOf(place);
              if (!copies.has(key)) keep(key, { data, seq: (asked += 1), at });
            }),
          ),
        // What is on its way was asked before: it is neither joined nor kept.
        forget: Effect.sync(() => {
          copies.clear();
          flying.clear();
          forgotten = asked;
        }),
      };
    }),
  ).pipe(Layer.provide(inner));
