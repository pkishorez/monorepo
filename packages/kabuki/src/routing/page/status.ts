import { Schema } from 'effect';
import type { Answer } from '../capability/index.ts';
import type { Codec, RenderMode, Value } from '../route/index.ts';

/*
 * What a Page is handed about its data and where it is: its `status`, and
 * `route`, Kabuki's part of its Props; and what the Router starts a place's
 * data from.
 */

/** What is known of a place whatever its data: how it is drawn, and how long its data stays fresh. */
export interface PlaceInfo {
  readonly render: RenderMode;
  /** Its Stale time, in milliseconds; `null` for a static page, fresh until the next deploy. */
  readonly staleTime: number | null;
}

/** Where a place's data came from: the page the server drew, a load by the app, or a copy the Data cache kept. */
export type From = 'server' | 'browser' | 'cache';

/** What is known of a place's data once it is there, besides the data. */
export interface DataInfo extends PlaceInfo {
  readonly from: From;
  /** When it arrived, in milliseconds since the epoch: its Stale time counts from it. */
  readonly arrivedAt: number;
  /** When it goes stale, in milliseconds since the epoch; `null` for a static page. */
  readonly freshUntil: number | null;
  /** How long, in milliseconds, from asking for it to its answer; `null` for a copy. */
  readonly took: number | null;
}

/**
 * Where a page's data is: loading, failed, or there. `refreshing` is true
 * while it loads again behind the data shown, after a reload or on a copy
 * the Data cache kept. `waited` is true when the data took the place of a
 * loading screen the page drew, so a View can fade it in then alone, as
 * `Router.FadeIn` does; data that came before anything was drawn, or behind
 * data shown, did not wait. `notFound` is a Loader's `Page.notFound()`. `info`
 * is good to know, never needed to draw: how the page is drawn, its Stale
 * time, and once its data is there, where it came from and when it goes
 * stale.
 */
export type Status<D> =
  | { readonly _tag: 'Loading'; readonly info: PlaceInfo }
  | {
      readonly _tag: 'Failed';
      readonly reason: string;
      readonly notFound: boolean;
      readonly info: PlaceInfo;
    }
  | {
      readonly _tag: 'Ready';
      readonly data: D;
      readonly refreshing: boolean;
      /** It took the place of a loading screen the page drew. */
      readonly waited: boolean;
      readonly info: DataInfo;
    };

const placeInfo = {
  render: Schema.Literals(['static', 'dynamic', 'client']),
  staleTime: Schema.NullOr(Schema.Number),
};
const PlaceInfoSchema = Schema.Struct(placeInfo);
export const DataInfoSchema = Schema.Struct({
  ...placeInfo,
  from: Schema.Literals(['server', 'browser', 'cache']),
  arrivedAt: Schema.Number,
  freshUntil: Schema.NullOr(Schema.Number),
  took: Schema.NullOr(Schema.Number),
});

export const statusSchema = <D>(data: Codec<D>): Codec<Status<D>> =>
  Schema.TaggedUnion({
    Loading: { info: PlaceInfoSchema },
    Failed: {
      reason: Schema.String,
      notFound: Schema.Boolean,
      info: PlaceInfoSchema,
    },
    Ready: {
      data,
      refreshing: Schema.Boolean,
      waited: Schema.Boolean,
      info: DataInfoSchema,
    },
  }) as unknown as Codec<Status<D>>;

/** What is known of a place whatever its data. */
export const placeInfoOf = (place: {
  readonly render: RenderMode;
  readonly staleTime: number;
}): PlaceInfo => ({
  render: place.render,
  staleTime: Number.isFinite(place.staleTime) ? place.staleTime : null,
});

/** What is known of a place's data that arrived `at`, from `from`, in `took`. */
export const dataInfoOf = (
  place: { readonly render: RenderMode; readonly staleTime: number },
  data: {
    readonly from: From;
    readonly at: number;
    readonly took: number | null;
  },
): DataInfo => {
  const info = placeInfoOf(place);
  return {
    ...info,
    from: data.from,
    arrivedAt: data.at,
    freshUntil: info.staleTime === null ? null : data.at + info.staleTime,
    took: data.took,
  };
};

/**
 * What a place's data starts from, when something is known as it lands:
 * data, stale if the Data cache kept it, with where it came from, when it
 * arrived and how long it took; or why there is none.
 */
export type Known =
  | {
      readonly _tag: 'Ready';
      readonly data: unknown;
      readonly stale: boolean;
      readonly from: From;
      /** When it arrived, in milliseconds since the epoch: its Stale time counts from it. */
      readonly at: number;
      readonly took: number | null;
    }
  | {
      readonly _tag: 'Failed';
      readonly reason: string;
      readonly notFound: boolean;
    };

/**
 * What an answer tells a place's data it starts from: arrived when the
 * Data cache says, else `now`; from a copy if the Data cache kept it, else
 * from `from`. A Redirect tells it nothing, the Router follows it.
 */
export const knownOf = (
  answer: Answer,
  now: number,
  from: From,
): Known | undefined => {
  switch (answer._tag) {
    case 'Loaded':
      return {
        _tag: 'Ready',
        data: answer.data,
        stale: answer.stale === true,
        from: answer.cached ? 'cache' : from,
        at: answer.at ?? now,
        took: answer.cached ? null : (answer.took ?? null),
      };
    case 'NotFound':
      return { _tag: 'Failed', reason: 'Not found', notFound: true };
    case 'Broken':
      return { _tag: 'Failed', reason: answer.reason, notFound: false };
    case 'Redirect':
      return undefined;
  }
};

/**
 * Kabuki's part of a Page's Props: where it sits. `page` is the Route one
 * level down, if the URL goes on, so a View can tell which of its pages is
 * open.
 */
export interface Where<Page = Value> {
  /** Its dotted name, `Team.Project`; the root's is `''`. */
  readonly name: string;
  /** The Route one level down, if the URL goes on. */
  readonly page?: Page;
  /** Every path param down to it, its ancestors' too. */
  readonly params: Readonly<Record<string, unknown>>;
  /** The URL's path when it names no place; only the root sees one. */
  readonly notFound: string | null;
}

/**
 * What a Page's `route` carries besides, which its pages are made from: out
 * of its type, so a page never reads it.
 */
export interface Carried<Page = Value> extends Where<Page> {
  /** The status of each place below it, by dotted name, as the Router holds it. */
  readonly data?: Readonly<Record<string, Status<unknown>>>;
}

export const whereSchema = (page: Codec<unknown> | undefined) =>
  Schema.Struct({
    name: Schema.String,
    ...(page ? { page: Schema.optionalKey(page) } : {}),
    params: Schema.Record(Schema.String, Schema.Unknown),
    notFound: Schema.NullOr(Schema.String),
    data: Schema.optionalKey(Schema.Record(Schema.String, Schema.Unknown)),
  });
