import { Exit, Schema } from 'effect';
import type { Codec, PlaceSchema } from '../../routing/route/index.ts';

/*
 * The Loader RPC: how the browser asks the server for the Inputs of the
 * places a move needs, all in one request. Made from the Routes, so it
 * cannot disagree with them: a place with an Input is one call, its params
 * the payload, its Input the answer, NotFound or Redirect its failure.
 *
 * It is a fixed JSON protocol over the Routes' Schemas rather than an
 * `effect/rpc` group: a move asks for all its places at once, which one
 * request with one answer says directly, a Loader is handed the very request
 * that asked, cookies and all, and the browser ships no RPC client.
 */

/** Where the server answers it. */
export const PATH = '/_kabuki/load';

/*
 * The Loader RPC's messages, in JSON, each value written with the Routes' own
 * Schemas: a place's params with its params Schema, its Input with its Input
 * Schema, a Redirect's Route with the Route Schema.
 *
 *   ask     { places: [{ name: 'Blog.Post', params: { slug: 'hello' } }] }
 *   answer  { _tag: 'Loaded', inputs: { 'Blog.Post': { … } } }
 *         | { _tag: 'NotFound' }
 *         | { _tag: 'Redirect', route: { _tag: 'Blog', page: … } }
 */

/** What the wire needs of a Routes tree: every place, and the Schema of every Route. */
export interface RoutesOnWire {
  readonly every: ReadonlyArray<PlaceSchema>;
  readonly route: Codec<unknown>;
}

export type Answer =
  | {
      readonly _tag: 'Loaded';
      readonly inputs: Readonly<Record<string, unknown>>;
    }
  | { readonly _tag: 'NotFound' }
  | { readonly _tag: 'Redirect'; readonly route: unknown };

/** A place to load, decoded: its dotted name and its params. */
export interface Wanted {
  readonly name: string;
  readonly params: Readonly<Record<string, unknown>>;
}

const Ask = Schema.Struct({
  places: Schema.Array(
    Schema.Struct({ name: Schema.String, params: Schema.Unknown }),
  ),
});

/** Every place with an Input, by dotted name: only those can be asked for. */
export const loadable = (routes: RoutesOnWire) =>
  new Map(
    routes.every.flatMap((place) =>
      place.input ? [[place.name, place] as const] : [],
    ),
  );

type Places = ReturnType<typeof loadable>;

const placeOf = (places: Places, name: string) => {
  const place = places.get(name);
  if (!place)
    throw new Error(
      `[@kestack/kabuki/start] ${name} is not a place with an Input`,
    );
  return place;
};

const sync = <A>(exit: Exit.Exit<A, unknown>, what: string): A => {
  if (Exit.isSuccess(exit)) return exit.value;
  throw new Error(`[@kestack/kabuki/start] ${what}`, { cause: exit.cause });
};

export const writeAsk = (places: Places, wanted: ReadonlyArray<Wanted>) => ({
  places: wanted.map(({ name, params }) => ({
    name,
    params: sync(
      Schema.encodeUnknownExit(placeOf(places, name).params)(params),
      `the params of ${name} do not match its Schema`,
    ),
  })),
});

/** The places a request asks for, or why it cannot be read. Throws on a malformed ask. */
export const readAsk = (places: Places, body: unknown): ReadonlyArray<Wanted> =>
  sync(
    Schema.decodeUnknownExit(Ask)(body),
    'the ask is not { places: [{ name, params }] }',
  ).places.map(({ name, params }) => ({
    name,
    params: sync(
      Schema.decodeUnknownExit(placeOf(places, name).params)(params),
      `the params of ${name} do not match its Schema`,
    ),
  }));

const inputsWith =
  (direction: 'encode' | 'decode') =>
  (places: Places, inputs: Readonly<Record<string, unknown>>) =>
    Object.fromEntries(
      Object.entries(inputs).map(([name, input]) => {
        const schema = placeOf(places, name).input!;
        return [
          name,
          sync(
            direction === 'encode'
              ? Schema.encodeUnknownExit(schema)(input)
              : Schema.decodeUnknownExit(schema)(input),
            `the Input of ${name} does not match its Schema`,
          ),
        ];
      }),
    );

export const writeInputs = inputsWith('encode');
export const readInputs = inputsWith('decode');

export const writeRoute = (routes: RoutesOnWire, route: unknown) =>
  sync(
    Schema.encodeUnknownExit(routes.route)(route),
    'a Redirect names no Route',
  );

export const readRoute = (routes: RoutesOnWire, route: unknown) =>
  sync(
    Schema.decodeUnknownExit(routes.route)(route),
    'a Redirect names no Route',
  );
