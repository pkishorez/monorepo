import type { AnyRoute } from '../capabilities/index.ts';
import { Clock, Effect, Option, Schema } from 'effect';
import { Command } from '../../core/index.ts';
import { lazyOf } from '../../react/index.ts';
import { Loading } from '../capabilities/index.ts';
import { knownOf } from '../page/index.ts';
import type { AnyPageBuild, Known } from '../page/index.ts';
import type { Value } from '../route/index.ts';
import type { PendingMove, RoutesLike, Send } from './model.ts';

/*
 * What the Router loads through `Loading`: the data a pending move wants,
 * and the data and code a preload warms, each beside the code of the lazy
 * Views it will draw.
 */
export const loadsOf = <Route extends AnyRoute>(
  routes: RoutesLike<Route>,
  root: AnyPageBuild,
) => {
  const RouteSchema = routes.route;
  type Send = SendOf<Route>;
  /**
   * Starts loading the code of the lazy View of every page on `route`, so it
   * loads beside the page's data rather than after it. Code that fails to
   * load is loaded again when it is drawn.
   */
  const preloadViews = (route: Route) =>
    Effect.sync(() => {
      let build: AnyPageBuild | undefined = root;
      let value = route as unknown as Value | undefined;
      while (build && value) {
        build = (build.pages as Record<string, AnyPageBuild>)[value._tag];
        if (build)
          lazyOf(build)
            ?.preload()
            .catch(() => {});
        value = value['page'] as Value | undefined;
      }
    });

  /**
   * Loads what the pending move wants, through `Loading`: with none, it
   * lands without. The code of the lazy Views it will draw starts loading
   * at the same time, so it is not a second wait after the data. A Redirect,
   * the outermost first, moves on instead.
   */
  const load = (pending: PendingMove<Route>, send: Send) =>
    Effect.gen(function* () {
      yield* preloadViews(pending.to);
      const found = yield* Effect.serviceOption(Loading);
      const { id } = pending;
      if (Option.isNone(found))
        return yield* send({ _tag: 'Loaded', id, known: {} });
      // Data loaded anew is never answered by a copy, nor joins a load
      // asked before: the Data cache is dropped before it asks.
      if (pending.anew && found.value.forget) yield* found.value.forget;
      const places = routes
        .places(pending.to)
        .filter((place) => pending.wanted.includes(place.name));
      const answers = yield* found.value.load(
        places.map(({ name, params }) => ({ name, params })),
      );
      for (const { name } of places) {
        const answer = answers[name];
        if (answer?._tag === 'Redirect')
          return yield* send(
            answer.href === undefined
              ? { _tag: 'Redirected', id, route: answer.route as Route }
              : { _tag: 'RedirectedAway', href: answer.href, id },
          );
      }
      const known: Record<string, Known> = {};
      const now = yield* Clock.currentTimeMillis;
      for (const { name } of places) {
        const each = answers[name] && knownOf(answers[name], now, 'browser');
        if (each) known[name] = each;
      }
      yield* send({ _tag: 'Loaded', id, known });
    });

  /** Warms the Data cache, and the code of the lazy Views, for a Route the app may move to. */
  const preload = Command.make('preload', {
    args: Schema.Struct({ route: RouteSchema }),
    run: ({ route }) =>
      Effect.gen(function* () {
        yield* preloadViews(route as Route);
        const found = yield* Effect.serviceOption(Loading);
        if (Option.isNone(found) || !found.value.preload) return;
        yield* found.value.preload(
          routes
            .places(route as Route)
            .filter((place) => place.input)
            .map(({ name, params }) => ({ name, params })),
        );
      }),
  });

  return { load, preload };
};

type SendOf<Route extends AnyRoute> = Send<Route>;

export type Loads<Route extends AnyRoute> = ReturnType<typeof loadsOf<Route>>;
