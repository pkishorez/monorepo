import { Cause, Effect, Layer, Stream } from 'effect';
import { Loading } from '../../routing/capabilities/index.ts';
import type { Answer } from '../../routing/capabilities/index.ts';
import {
  PATH,
  dataPath,
  loadable,
  readLine,
  writeAsk,
} from '../app/protocol/index.ts';
import type { Line, RoutesOnWire, Wanted } from '../app/protocol/index.ts';

/*
 * The Loader RPC, asked: the `Loading` behind the browser's Data cache, one
 * request for every place asked for at once, each answered as its line
 * comes. The protocol is `app/protocol/wire.ts`.
 *
 * A static place is not asked for there once a build kept the Static Data: its
 * answer is a file that never changes, read with a plain `GET`, so a CDN,
 * a service worker and the browser itself may keep it, and no Loader runs.
 * The files are `app/protocol/data.ts`.
 */

type Send = (input: string, init?: RequestInit) => Promise<Response>;

export interface LoadingOptions {
  readonly fetch?: typeof fetch;
  /** Where the Loader RPC is: `/_kabuki/load` unless said. */
  readonly url?: string;
  /** Where the build kept the Static Data, as the page says: with none, a static place is asked for at the Loader RPC, as in dev. */
  readonly data?: string;
}

/**
 * Reads one static place's kept answer; a path the build did not list has
 * no file, so it is not found. None where the server keeps no such answer,
 * a `410`, as after a deploy, when the place is the Loader RPC's.
 */
export const keptAnswer = (
  routes: RoutesOnWire,
  data: string,
  send: Send = (input, init) => fetch(input, init),
) => {
  const places = loadable(routes);
  return (
    wanted: Wanted,
  ): Effect.Effect<readonly [string, Answer | undefined]> => {
    const { name, params } = wanted;
    return Effect.tryPromise({
      try: async (signal): Promise<Answer | undefined> => {
        const response = await send(
          `${data}${dataPath(places.get(name)!, params)}`,
          { signal },
        );
        if (response.status === 410) return undefined;
        if (response.status === 404) return { _tag: 'NotFound' };
        if (!response.ok)
          throw new Error(`the Static Data answered ${response.status}`);
        const line = { name, outcome: (await response.json()) as Answer };
        return readLine(routes, places, line).outcome as Answer;
      },
      catch: (cause) => cause,
    }).pipe(
      Effect.catch((cause) =>
        Effect.succeed<Answer>({
          _tag: 'Broken',
          reason:
            cause instanceof Error
              ? cause.message
              : 'the Static Data did not answer',
        }),
      ),
      Effect.map((answer) => [name, answer] as const),
    );
  };
};

/**
 * The browser's side: a `Loading` that asks the server, in one request per
 * ask, and hands on each place's answer as it comes; a static place's is
 * read from the build's Static Data instead, where there is one. A request that
 * does not get an answer breaks every place it asked for, so each page
 * shows it failed and can retry.
 */
export const loading = (
  routes: RoutesOnWire,
  options: LoadingOptions = {},
): Layer.Layer<Loading> => {
  const places = loadable(routes);
  const send: Send = options.fetch ?? ((input, init) => fetch(input, init));
  const kept =
    options.data === undefined
      ? undefined
      : keptAnswer(routes, options.data, send);
  // Once the server keeps no answers of this build, every place is the Loader RPC's.
  let gone = false;
  const isKept = ({ name }: Wanted) =>
    kept !== undefined && !gone && places.get(name)?.render === 'static';
  const asked = (
    wanted: ReadonlyArray<Wanted>,
  ): Stream.Stream<readonly [string, Answer]> => {
    const answered = new Set<string>();
    let broken: string | undefined;
    return Stream.unwrap(
      Effect.gen(function* () {
        const response = yield* Effect.tryPromise({
          try: (signal) =>
            send(options.url ?? PATH, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(writeAsk(places, wanted)),
              signal,
            }),
          catch: (cause) => cause,
        });
        if (!response.ok || !response.body)
          return yield* Effect.fail(
            new Error(`the Loader RPC answered ${response.status}`),
          );
        return Stream.fromReadableStream({
          evaluate: () => response.body!,
          onError: (cause) => cause,
        }).pipe(
          Stream.decodeText(),
          Stream.splitLines,
          Stream.filter((line) => line.trim() !== ''),
          Stream.map((line): readonly [string, Answer] | null => {
            try {
              const read = readLine(routes, places, JSON.parse(line) as Line);
              answered.add(read.name);
              return [read.name, read.outcome as Answer];
            } catch (error) {
              broken = error instanceof Error ? error.message : String(error);
              return null;
            }
          }),
          Stream.filter(
            (entry): entry is readonly [string, Answer] => entry !== null,
          ),
        );
      }),
    ).pipe(
      Stream.catchCause((cause) => {
        const error = Cause.squash(cause);
        broken =
          error instanceof Error
            ? error.message
            : 'the Loader RPC did not answer';
        return Stream.empty;
      }),
      // Every place the answer did not reach is broken, with why if it broke.
      Stream.concat(
        Stream.suspend(() =>
          Stream.fromIterable(
            wanted
              .filter(({ name }) => !answered.has(name))
              .map(
                ({ name }) =>
                  [
                    name,
                    {
                      _tag: 'Broken',
                      reason: broken ?? `no answer for ${name}`,
                    } as Answer,
                  ] as const,
              ),
          ),
        ),
      ),
    );
  };

  const each: NonNullable<(typeof Loading.Service)['each']> = (wanted) => {
    const here = wanted.filter(isKept);
    const there = wanted.filter((place) => !isKept(place));
    if (!kept || here.length === 0) return asked(there);
    const read = Stream.fromIterable(here).pipe(
      Stream.mapEffect(
        (place) =>
          Effect.map(kept(place), ([name, answer]) => ({
            place,
            name,
            answer,
          })),
        {
          concurrency: 'unbounded',
          unordered: true,
        },
      ),
      Stream.flatMap(
        ({ place, name, answer }) => {
          if (answer) return Stream.make([name, answer] as const);
          gone = true;
          return asked([place]);
        },
        { concurrency: 'unbounded' },
      ),
    );
    return there.length === 0 ? read : Stream.merge(read, asked(there));
  };

  return Layer.succeed(Loading, {
    each,
    load: (wanted) =>
      Stream.runCollect(each(wanted)).pipe(
        Effect.map((answers) => Object.fromEntries(answers)),
      ),
  });
};
