import { Schema } from 'effect';
import type { Answer } from '../capability/index.ts';
import type { Codec, Value } from '../route/index.ts';

/*
 * What a Page is handed about its data and where it is: its `status`, and
 * `route`, Kabuki's part of its Props; and what the Router starts a place's
 * data from.
 */

/**
 * Where a page's data is: loading, failed, or there. `refreshing` is true
 * while it loads again behind the data shown, after a reload or on a copy
 * the Data cache kept. `notFound` is a Loader's `Page.notFound()`.
 */
export type Status<D> =
  | { readonly _tag: 'Loading' }
  | {
      readonly _tag: 'Failed';
      readonly reason: string;
      readonly notFound: boolean;
    }
  | { readonly _tag: 'Ready'; readonly data: D; readonly refreshing: boolean };

export const statusSchema = <D>(data: Codec<D>): Codec<Status<D>> =>
  Schema.TaggedUnion({
    Loading: {},
    Failed: { reason: Schema.String, notFound: Schema.Boolean },
    Ready: { data, refreshing: Schema.Boolean },
  }) as unknown as Codec<Status<D>>;

/** What a place's data starts from, when something is known as it lands: data, stale if the Data cache kept it, or why there is none. */
export type Known =
  | { readonly _tag: 'Ready'; readonly data: unknown; readonly stale: boolean }
  | {
      readonly _tag: 'Failed';
      readonly reason: string;
      readonly notFound: boolean;
    };

/** What an answer tells a place's data it starts from; a Redirect tells it nothing, the Router follows it. */
export const knownOf = (answer: Answer): Known | undefined => {
  switch (answer._tag) {
    case 'Loaded':
      return { _tag: 'Ready', data: answer.data, stale: answer.stale === true };
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
