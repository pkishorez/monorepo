import { Effect, Option, Schema } from 'effect';
import { Loading } from '../capability/index.ts';
import type { AnyRoute } from '../capability/index.ts';
import type { DataInfo, Known, Status } from '../page/index.ts';
import {
  DataInfoSchema,
  dataInfoOf,
  placeInfoOf,
  statusSchema,
} from '../page/index.ts';
import type { Codec, Place } from '../route/index.ts';

/*
 * The data of every place on screen, held by the Router: one entry per
 * place with data on the Route drawn, by dotted name. Each page is handed
 * its own as `status`.
 *
 * 1. Start  as a move lands, each new place from what is known: the data
 *           the move loaded before it landed, the server's, or the Data
 *           cache's copy, which it shows, and loads again once stale.
 *           Knowing nothing, Loading. A place whose key, its name and path
 *           params, did not change keeps what it has.
 * 2. Load   with the `place` Worker, one run per place whose data is due:
 *           while it is loading, after a reload, on a stale copy, or when
 *           its query changes. The data shown stays meanwhile; a loading
 *           screen stays at least 300 ms.
 * 3. Settle each answer into its place: Ready, or Failed, keeping data
 *           shown when loading it again fails for the same query; a
 *           Redirect replaces the entry, or leaves the app for a URL outside
 *           it. An answer for a place no longer on screen is dropped.
 */

/** How long a page's loading screen stays at least, so it never flashes. */
const MINIMUM = 300;

/** One place's data, as the Router holds it. */
export interface Held {
  /** The place's key: a place with another key is another place. */
  readonly key: string;
  readonly status: Status<unknown>;
  /** How many reloads its data has seen. */
  readonly reload: number;
  /** What its Loader was handed, as one string: a new query loads it again. */
  readonly for: string;
}

export type Holding = Readonly<Record<string, Held>>;

/** What the Router reads of the Routes for the data of its places. */
export interface DataRoutes<Route> {
  readonly data: ReadonlyArray<readonly [string, Codec<unknown>]>;
  readonly places: (of: Route) => ReadonlyArray<Place>;
}

/** What the Schemas of the data need of the Routes. */
type DataSchemas = Pick<DataRoutes<never>, 'data'>;

const forOf = (place: Place) => JSON.stringify(place.params);

/** The data of the places with data, by dotted name, each with its own Schema. */
export const holdingSchema = (routes: DataSchemas) =>
  Schema.Struct(
    Object.fromEntries(
      routes.data.map(([name, data]) => [
        name,
        Schema.optionalKey(
          Schema.Struct({
            key: Schema.String,
            status: statusSchema(data),
            reload: Schema.Number,
            for: Schema.String,
          }),
        ),
      ]),
    ),
  ) as unknown as Codec<Holding>;

/** One answer for one place, with its data by its own Schema. */
const answerSchema = (routes: DataSchemas) =>
  (routes.data.length === 0
    ? Schema.Never
    : Schema.Union(
        routes.data.map(([name, data]) =>
          Schema.Struct({ name: Schema.Literal(name), data }),
        ),
      )) as unknown as Codec<{ readonly name: string; readonly data: unknown }>;

/** The Router's Messages for the data of its places. */
export const placeMessages = (routes: DataSchemas) => ({
  PlaceLoaded: {
    answer: answerSchema(routes),
    key: Schema.String,
    stale: Schema.Boolean,
    info: DataInfoSchema,
    reload: Schema.Number,
    for: Schema.String,
  },
  PlaceFailed: {
    name: Schema.String,
    key: Schema.String,
    reason: Schema.String,
    notFound: Schema.Boolean,
    reload: Schema.Number,
    for: Schema.String,
  },
  PlaceRedirected: { route: Schema.Struct({ _tag: Schema.String }) },
  RedirectedAway: {
    href: Schema.String,
    id: Schema.optionalKey(Schema.Number),
  },
});

export type PlaceMessage =
  | {
      readonly _tag: 'PlaceLoaded';
      readonly answer: { readonly name: string; readonly data: unknown };
      readonly key: string;
      readonly stale: boolean;
      readonly info: DataInfo;
      readonly reload: number;
      readonly for: string;
    }
  | {
      readonly _tag: 'PlaceFailed';
      readonly name: string;
      readonly key: string;
      readonly reason: string;
      readonly notFound: boolean;
      readonly reload: number;
      readonly for: string;
    }
  | { readonly _tag: 'PlaceRedirected'; readonly route: AnyRoute }
  | {
      readonly _tag: 'RedirectedAway';
      readonly href: string;
      /** The held move it ends, if it came from one. */
      readonly id?: number;
    };

// 1. Start
/** The data of the places with data on `route`: kept where the key is the same, else started from what is known. */
export const holdingAt = <Route>(
  routes: DataRoutes<Route>,
  route: Route,
  before: Holding,
  known: Readonly<Record<string, Known>>,
  reload: number,
): Holding => {
  const out: Record<string, Held> = {};
  for (const place of routes.places(route)) {
    if (!place.input) continue;
    const kept = before[place.name];
    if (kept && kept.key === place.key) {
      out[place.name] = kept;
      continue;
    }
    const from = known[place.name];
    out[place.name] = {
      key: place.key,
      reload,
      for: forOf(place),
      status:
        from?._tag === 'Ready'
          ? {
              _tag: 'Ready',
              data: from.data,
              refreshing: from.stale,
              info: dataInfoOf(place, from),
            }
          : from?._tag === 'Failed'
            ? {
                _tag: 'Failed',
                reason: from.reason,
                notFound: from.notFound,
                info: placeInfoOf(place),
              }
            : { _tag: 'Loading', info: placeInfoOf(place) },
    };
  }
  return out;
};

// 2. Load
/** Whether a place's data is due to load, and why: the run it is loaded for, as one key. */
const dueOf = (
  place: Place,
  held: Held,
  reload: number,
): string | undefined => {
  const asked = reload > held.reload || forOf(place) !== held.for;
  const { status } = held;
  if (
    status._tag === 'Loading' ||
    (status._tag === 'Ready' && status.refreshing) ||
    asked
  )
    // The status is in the key, so a copy that came while it loaded, stale,
    // is loaded again fresh: the run for a key it kept is not.
    return `${place.name}|${held.key}|${reload}|${forOf(place)}|${status._tag}`;
  return undefined;
};

/** The runs of the `place` Worker: one per place on `route` whose data is due. */
export const dueRuns = <Route>(
  routes: DataRoutes<Route>,
  route: Route,
  holding: Holding,
  reload: number,
): ReadonlyArray<string> =>
  routes.places(route).flatMap((place) => {
    const held = holding[place.name];
    const due = held && dueOf(place, held, reload);
    return due ? [due] : [];
  });

/** Each place's status as its page sees it: data that is due is loading, behind the data shown if there is any. */
export const shownOf = <Route>(
  routes: DataRoutes<Route>,
  route: Route,
  holding: Holding,
  reload: number,
): Readonly<Record<string, Status<unknown>>> => {
  const out: Record<string, Status<unknown>> = {};
  for (const place of routes.places(route)) {
    const held = holding[place.name];
    if (!held) continue;
    const { status } = held;
    out[place.name] =
      dueOf(place, held, reload) === undefined
        ? status
        : status._tag === 'Ready'
          ? { ...status, refreshing: true }
          : { _tag: 'Loading', info: placeInfoOf(place) };
  }
  return out;
};

/** The data of each place drawn with its data there, by dotted name: what the Metadata is worked out from. */
export const readyOf = (
  shown: Readonly<Record<string, Status<unknown>>>,
): Readonly<Record<string, unknown>> =>
  Object.fromEntries(
    Object.entries(shown).flatMap(([name, status]) =>
      status._tag === 'Ready' ? [[name, status.data]] : [],
    ),
  );

/**
 * Loads the data of one place, for the run `run` names, through `Loading`:
 * with none, it stays loading. Sends what it came to.
 */
export const loadPlace = <Route>(
  routes: DataRoutes<Route>,
  run: string,
  self: {
    readonly send: (message: PlaceMessage) => Effect.Effect<void>;
    readonly get: Effect.Effect<{
      readonly route: Route;
      readonly holding: Holding;
      readonly reload: number;
    }>;
    readonly now: Effect.Effect<number>;
  },
) =>
  Effect.gen(function* () {
    const found = yield* Effect.serviceOption(Loading);
    if (Option.isNone(found)) return;
    const name = run.slice(0, run.indexOf('|'));
    const { route, holding, reload } = yield* self.get;
    const place = routes.places(route).find((each) => each.name === name);
    const held = holding[name];
    if (!place || !held || dueOf(place, held, reload) !== run) return;
    const shown = shownOf(routes, route, holding, reload)[name];
    const began = yield* self.now;
    const answers = yield* found.value.load(
      [{ name, params: place.params }],
      // Data being loaded for a place that has none yet may already be on
      // its way, or kept. Behind a stale copy it may be on its way, as a
      // preload's: joined, never answered by the copy. A reload's is asked
      // again, joining nothing.
      reload > held.reload
        ? { fresh: true }
        : held.status._tag === 'Loading'
          ? {}
          : { again: true },
    );
    // When the answer came, before the loading screen's least time.
    const arrived = yield* self.now;
    if (shown?._tag === 'Loading')
      yield* Effect.sleep(Math.max(0, began + MINIMUM - (yield* self.now)));
    const answer = answers[name] ?? {
      _tag: 'Broken',
      reason: `no answer for ${name}`,
    };
    const stamp = { key: held.key, reload, for: forOf(place) };
    const failed = (reason: string, notFound: boolean) =>
      self.send({ _tag: 'PlaceFailed', name, reason, notFound, ...stamp });
    switch (answer._tag) {
      case 'Loaded': {
        const schema = routes.data.find(([each]) => each === name)?.[1];
        return yield* schema && !Schema.is(Schema.toType(schema))(answer.data)
          ? failed(`the data of ${name} does not match its Schema`, false)
          : self.send({
              _tag: 'PlaceLoaded',
              answer: { name, data: answer.data },
              stale: answer.stale === true,
              info: dataInfoOf(place, {
                from: answer.cached ? 'cache' : 'browser',
                at: answer.at ?? arrived,
                took: answer.cached ? null : (answer.took ?? arrived - began),
              }),
              ...stamp,
            });
      }
      case 'NotFound':
        return yield* failed('Not found', true);
      case 'Broken':
        return yield* failed(answer.reason, false);
      case 'Redirect':
        return yield* self.send(
          answer.href === undefined
            ? { _tag: 'PlaceRedirected', route: answer.route as AnyRoute }
            : { _tag: 'RedirectedAway', href: answer.href },
        );
    }
  });

// 3. Settle
/** The data of the places once an answer for one of them came: unchanged if that place is gone. */
export const settle = (
  holding: Holding,
  message: Exclude<
    PlaceMessage,
    { readonly _tag: 'PlaceRedirected' | 'RedirectedAway' }
  >,
): Holding => {
  const name =
    message._tag === 'PlaceLoaded' ? message.answer.name : message.name;
  const held = holding[name];
  if (!held || held.key !== message.key) return holding;
  if (message._tag === 'PlaceLoaded')
    return {
      ...holding,
      [name]: {
        key: held.key,
        status: {
          _tag: 'Ready',
          data: message.answer.data,
          refreshing: message.stale,
          info: message.info,
        },
        reload: message.reload,
        for: message.for,
      },
    };
  // Loading again behind data shown, for the same query, keeps it.
  return {
    ...holding,
    [name]:
      held.status._tag === 'Ready' && message.for === held.for
        ? {
            ...held,
            status: { ...held.status, refreshing: false },
            reload: message.reload,
          }
        : {
            key: held.key,
            status: {
              _tag: 'Failed',
              reason: message.reason,
              notFound: message.notFound,
              info: {
                render: held.status.info.render,
                staleTime: held.status.info.staleTime,
              },
            },
            reload: message.reload,
            for: message.for,
          },
  };
};
