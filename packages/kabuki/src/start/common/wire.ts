import { Exit, Schema } from 'effect';
import type { Codec, Outcome, PlaceSchema } from '../../routing/route/index.ts';

/*
 * The Loader RPC: how the browser asks the server for the data of the
 * places a move needs, all in one request. Made from the Routes, so it
 * cannot disagree with them: a place with data is one call, what its Loader
 * is handed the payload, and its outcome the answer.
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
 * Schemas: what a place's Loader is handed with its params Schema, its data
 * with its data Schema, a Redirect's Route with the Route Schema. Each place
 * is answered on its own line, as soon as its Loader is done, so a quick
 * place never waits on a slow one, and one that breaks fails its page alone.
 *
 *   ask     { places: [{ name: 'Blog.Post', params: { slug: 'hello' } }] }
 *   answer  one line of JSON per place, in the order they finish:
 *           { name: 'Blog.Post', outcome: { _tag: 'Loaded', data: { … } } }
 *           each outcome one of  { _tag: 'Loaded', data }  { _tag: 'NotFound' }
 *                        { _tag: 'Redirect', route }  { _tag: 'Broken', reason }
 */

/** What the wire needs of a Routes tree: every place, and the Schema of every Route. */
export interface RoutesOnWire {
  readonly every: ReadonlyArray<PlaceSchema>;
  readonly route: Codec<unknown>;
}

/** One line of the answer: what loading one place came to. */
export interface Line {
  readonly name: string;
  readonly outcome: Outcome;
}

/** The answer's media type: one JSON value per line. */
export const NDJSON = 'application/x-ndjson';

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

/** Every place with data, by dotted name: only those can be asked for. */
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
    throw new Error(`[@kestack/kabuki/start] ${name} is not a place with data`);
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

const outcomeWith =
  (direction: 'encode' | 'decode') =>
  (routes: RoutesOnWire, places: Places, { name, outcome }: Line): Line => {
    const code = (schema: Codec<unknown>) => (value: unknown) =>
      direction === 'encode'
        ? Schema.encodeUnknownExit(schema)(value)
        : Schema.decodeUnknownExit(schema)(value);
    if (outcome._tag === 'Loaded')
      return {
        name,
        outcome: {
          _tag: 'Loaded',
          data: sync(
            code(placeOf(places, name).input!)(outcome.data),
            `the data of ${name} does not match its Schema`,
          ),
        },
      };
    if (outcome._tag === 'Redirect')
      return {
        name,
        outcome: {
          _tag: 'Redirect',
          route: sync(
            code(routes.route)(outcome.route),
            'a Redirect names no Route',
          ),
        },
      };
    return { name, outcome };
  };

/** One place's outcome as a line, its data and Redirect written with their Schemas. */
export const writeLine = outcomeWith('encode');
/** A line read back with its Schemas. */
export const readLine = outcomeWith('decode');
